import { useState, useEffect, useCallback, useRef } from 'react';
import { account } from '@/lib/appwrite';
import { pullSnapshotFromCloud, pushSnapshotToCloud, type BlobCache } from '@/lib/sync';
import type { AppSettings, Category, Flashcard } from '@/types/flashcard';
import type { SyncState } from '@/types/flashcard';
import { useOfflineStorage } from './useOfflineStorage';

export const ENABLE_CLOUD_SYNC = true;

interface SyncResult {
  success: boolean;
  error?: string;
  syncedCards?: number;
  syncedCategories?: number;
}

export function useFlashcardSync() {
  const storage = useOfflineStorage();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const blobCacheRef = useRef<BlobCache>(new Map());
  const [syncState, setSyncState] = useState<SyncState>({
    lastSyncedAt: null,
    isSyncing: false,
    isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
    pendingChanges: 0,
  });

  useEffect(() => {
    const handleOnline = () => {
      setSyncState((prev) => ({ ...prev, isOnline: true }));
    };

    const handleOffline = () => {
      setSyncState((prev) => ({ ...prev, isOnline: false }));
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const updatePendingCount = useCallback(async () => {
    const [pendingCards, pendingCategories, deletedEntityIds] = await Promise.all([
      storage.getPendingCards(),
      storage.getPendingCategories(),
      storage.getDeletedEntityIds(),
    ]);

    setSyncState((prev) => ({
      ...prev,
      pendingChanges:
        pendingCards.length +
        pendingCategories.length +
        deletedEntityIds.cardIds.length +
        deletedEntityIds.categoryIds.length,
    }));
  }, [storage]);

  useEffect(() => {
    void updatePendingCount();
  }, [updatePendingCount]);

  useEffect(() => {
    const checkSession = async () => {
      try {
        await account.get();
        setIsAuthenticated(true);
      } catch {
        setIsAuthenticated(false);
      }
    };

    void checkSession();
  }, []);

  const mergeData = useCallback(<T extends { id: string; updatedAt?: number }>(
    localItems: T[],
    remoteItems: T[]
  ): T[] => {
    const merged = new Map<string, T>();
    localItems.forEach((item) => merged.set(item.id, item));
    remoteItems.forEach((remoteItem) => {
      const localItem = merged.get(remoteItem.id);
      if (!localItem) {
        merged.set(remoteItem.id, remoteItem);
        return;
      }

      const localTime = localItem.updatedAt ?? 0;
      const remoteTime = remoteItem.updatedAt ?? 0;
      if (remoteTime > localTime) {
        merged.set(remoteItem.id, remoteItem);
      }
    });

    return Array.from(merged.values());
  }, []);

  const dedupeByLatest = useCallback(<T extends { id: string; updatedAt?: number }>(items: T[]): T[] => {
    const byId = new Map<string, T>();

    for (const item of items) {
      const existing = byId.get(item.id);
      if (!existing) {
        byId.set(item.id, item);
        continue;
      }

      const existingTime = existing.updatedAt ?? 0;
      const nextTime = item.updatedAt ?? 0;
      if (nextTime >= existingTime) {
        byId.set(item.id, item);
      }
    }

    return Array.from(byId.values());
  }, []);

  const syncToCloud = useCallback(async (): Promise<SyncResult> => {
    if (!syncState.isOnline) {
      return {
        success: false,
        error: 'You are offline. Push will work when internet is available.',
      };
    }

    setSyncState((prev) => ({ ...prev, isSyncing: true }));

    try {
      await account.get();
      setIsAuthenticated(true);

      // Fetch local data first
      const [cards, categories, settings, pendingCards, pendingCategories, deletedEntityIds] = await Promise.all([
        storage.getAllCards(),
        storage.getAllCategories(),
        storage.getSettings(),
        storage.getPendingCards(),
        storage.getPendingCategories(),
        storage.getDeletedEntityIds(),
      ]);

      console.log('[syncToCloud] Local data fetched:', {
        allCards: cards.length,
        allCategories: categories.length,
        pendingCards: pendingCards.length,
        pendingCategories: pendingCategories.length,
      });

      // Then pull from cloud with local data to avoid duplicates
      const cloudSnapshot = await pullSnapshotFromCloud(cards, categories);

      const cloudCards = dedupeByLatest(cloudSnapshot?.cards ?? []);
      const cloudCategories = dedupeByLatest(cloudSnapshot?.categories ?? []);
      const cardsToApply = dedupeByLatest(pendingCards);
      const categoriesToApply = dedupeByLatest(pendingCategories);

      const mergedCloudCards = mergeData(cloudCards, cardsToApply);
      const mergedCloudCategories = mergeData(cloudCategories, categoriesToApply);
      const deletedCardIdSet = new Set(deletedEntityIds.cardIds);
      const deletedCategoryIdSet = new Set(deletedEntityIds.categoryIds);

      const cleanedCloudCards = mergedCloudCards.filter(
        (card) => !deletedCardIdSet.has(card.id) && !deletedCategoryIdSet.has(card.categoryId)
      );
      const cleanedCloudCategories = mergedCloudCategories.filter(
        (category) => !deletedCategoryIdSet.has(category.id)
      );

      console.log('[syncToCloud] About to push:', {
        cleanedCardCount: cleanedCloudCards.length,
        cleanedCategoryCount: cleanedCloudCategories.length,
      });

      const now = Date.now();
      await pushSnapshotToCloud({
        version: 1,
        updatedAt: now,
        cards: cleanedCloudCards,
        categories: cleanedCloudCategories,
        settings,
      }, blobCacheRef.current);

      // After successful push, pull the updated cards from cloud to get proper storage URLs
      const updatedCloudSnapshot = await pullSnapshotFromCloud(cards, categories);
      const cloudCardsWithStorageUrls = updatedCloudSnapshot?.cards ?? [];
      
      // Create maps of cardId -> imageUrl and imageFileId from cloud (which has proper storage URLs after upload)
      const cloudImageUrls = new Map<string, string>();
      const cloudImageFileIds = new Map<string, string>();
      cloudCardsWithStorageUrls.forEach((card) => {
        if (card.imageUrl && !card.imageUrl.startsWith('data:')) {
          cloudImageUrls.set(card.id, card.imageUrl);
        }
        if (card.imageFileId) {
          cloudImageFileIds.set(card.id, card.imageFileId);
        }
      });

      const pushedCardIds = new Set(cardsToApply.map((card) => card.id));
      const pushedCategoryIds = new Set(categoriesToApply.map((category) => category.id));

      // Update local cards with proper storage URLs and fileIds if available from cloud
      const syncedCards: Flashcard[] = cards.map((card) => {
        const shouldMarkSynced = pushedCardIds.has(card.id);
        const storageUrl = cloudImageUrls.get(card.id);
        const imageFileId = cloudImageFileIds.get(card.id);
        
        return {
          ...card,
          // Replace base64 or 'pending' imageUrl with proper storage URL if available
          imageUrl: storageUrl || card.imageUrl,
          // Update imageFileId if available from cloud
          imageFileId: imageFileId || card.imageFileId,
          syncStatus: shouldMarkSynced ? 'synced' : card.syncStatus,
        };
      });
      const syncedCategories: Category[] = categories.map((category) => (
        pushedCategoryIds.has(category.id)
          ? { ...category, syncStatus: 'synced' }
          : category
      ));
      const syncedSettings: AppSettings = { ...settings, enableCloudSync: true };

      await Promise.all([
        storage.saveAllCards(syncedCards),
        storage.saveAllCategories(syncedCategories),
        storage.saveSettings(syncedSettings),
        storage.clearDeletedEntityIds({
          cardIds: deletedEntityIds.cardIds,
          categoryIds: deletedEntityIds.categoryIds,
        }),
      ]);

      await updatePendingCount();

      setSyncState((prev) => ({
        ...prev,
        isSyncing: false,
        lastSyncedAt: now,
      }));

      return {
        success: true,
        syncedCards: cardsToApply.length + deletedEntityIds.cardIds.length,
        syncedCategories: categoriesToApply.length + deletedEntityIds.categoryIds.length,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Cloud push failed';
      setSyncState((prev) => ({ ...prev, isSyncing: false }));
      return { success: false, error: message };
    }
  }, [dedupeByLatest, mergeData, storage, syncState.isOnline, updatePendingCount]);

  const pullFromCloud = useCallback(async (): Promise<SyncResult> => {
    if (!syncState.isOnline) {
      return {
        success: false,
        error: 'You are offline. Pull will work when internet is available.',
      };
    }

    setSyncState((prev) => ({ ...prev, isSyncing: true }));

    try {
      await account.get();
      setIsAuthenticated(true);

      const [localCards, localCategories, localSettings, deletedEntityIds] = await Promise.all([
        storage.getAllCards(),
        storage.getAllCategories(),
        storage.getSettings(),
        storage.getDeletedEntityIds(),
      ]);

      const snapshot = await pullSnapshotFromCloud(localCards, localCategories);
      if (!snapshot) {
        setSyncState((prev) => ({ ...prev, isSyncing: false }));
        return {
          success: false,
          error: 'No cloud backup found for this account.',
        };
      }

      const dedupedLocalCards = dedupeByLatest(localCards);
      const dedupedLocalCategories = dedupeByLatest(localCategories);
      const deletedCardIdSet = new Set(deletedEntityIds.cardIds);
      const deletedCategoryIdSet = new Set(deletedEntityIds.categoryIds);

      const dedupedRemoteCards = dedupeByLatest(snapshot.cards).filter(
        (card) => !deletedCardIdSet.has(card.id) && !deletedCategoryIdSet.has(card.categoryId)
      );
      const dedupedRemoteCategories = dedupeByLatest(snapshot.categories).filter(
        (category) => !deletedCategoryIdSet.has(category.id)
      );

      const mergedCards = mergeData(dedupedLocalCards, dedupedRemoteCards);
      const mergedCategories = mergeData(dedupedLocalCategories, dedupedRemoteCategories);

      const remoteCardMap = new Map(dedupedRemoteCards.map((card) => [card.id, card]));
      const remoteCategoryMap = new Map(dedupedRemoteCategories.map((category) => [category.id, category]));

      const resolvedCards: Flashcard[] = mergedCards.map((card) => {
        const remoteCard = remoteCardMap.get(card.id);
        const isRemoteWinner =
          !!remoteCard && (remoteCard.updatedAt ?? 0) >= (card.updatedAt ?? 0);

        return {
          ...card,
          syncStatus: isRemoteWinner ? 'synced' : 'pending',
        };
      });

      const resolvedCategories: Category[] = mergedCategories.map((category) => {
        const remoteCategory = remoteCategoryMap.get(category.id);
        const isRemoteWinner =
          !!remoteCategory && (remoteCategory.updatedAt ?? 0) >= (category.updatedAt ?? 0);

        return {
          ...category,
          syncStatus: isRemoteWinner ? 'synced' : 'pending',
        };
      });

      const mergedSettings: AppSettings = {
        ...localSettings,
        ...snapshot.settings,
        enableCloudSync: true,
      };

      await Promise.all([
        storage.saveAllCards(resolvedCards),
        storage.saveAllCategories(resolvedCategories),
        storage.saveSettings(mergedSettings),
      ]);

      await updatePendingCount();

      setSyncState((prev) => ({
        ...prev,
        isSyncing: false,
        lastSyncedAt: Date.now(),
      }));

      return {
        success: true,
        syncedCards: dedupedRemoteCards.length,
        syncedCategories: dedupedRemoteCategories.length,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Cloud pull failed';
      setSyncState((prev) => ({ ...prev, isSyncing: false }));
      return { success: false, error: message };
    }
  }, [dedupeByLatest, mergeData, storage, syncState.isOnline, updatePendingCount]);

  const fullSync = useCallback(async (): Promise<SyncResult> => {
    return syncToCloud();
  }, [syncToCloud]);

  const uploadImage = useCallback(async (cardId: string, imageData: string): Promise<string | null> => {
    await storage.saveImage(cardId, imageData);
    return null;
  }, [storage]);

  const setCardImageBlob = useCallback((cardId: string, blob: Blob) => {
    blobCacheRef.current.set(cardId, blob);
    console.log(`[useFlashcardSync] Cached blob for card ${cardId}: ${blob.size} bytes`);
  }, []);

  const clearCardImageBlob = useCallback((cardId: string) => {
    blobCacheRef.current.delete(cardId);
  }, []);

  return {
    syncState,
    syncToCloud,
    pullFromCloud,
    fullSync,
    uploadImage,
    setCardImageBlob,
    clearCardImageBlob,
    mergeData,
    updatePendingCount,
    isEnabled: ENABLE_CLOUD_SYNC && isAuthenticated,
  };
}