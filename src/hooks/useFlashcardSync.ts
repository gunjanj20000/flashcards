import { useState, useEffect, useCallback } from 'react';
import { account } from '@/lib/appwrite';
import { pullSnapshotFromCloud, pushSnapshotToCloud } from '@/lib/sync';
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

      const [cards, categories, settings, pendingCards, pendingCategories, deletedEntityIds, cloudSnapshot] = await Promise.all([
        storage.getAllCards(),
        storage.getAllCategories(),
        storage.getSettings(),
        storage.getPendingCards(),
        storage.getPendingCategories(),
        storage.getDeletedEntityIds(),
        pullSnapshotFromCloud(),
      ]);

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

      const now = Date.now();
      await pushSnapshotToCloud({
        version: 1,
        updatedAt: now,
        cards: cleanedCloudCards,
        categories: cleanedCloudCategories,
        settings,
      });

      const pushedCardIds = new Set(cardsToApply.map((card) => card.id));
      const pushedCategoryIds = new Set(categoriesToApply.map((category) => category.id));

      const syncedCards: Flashcard[] = cards.map((card) => (
        pushedCardIds.has(card.id)
          ? { ...card, syncStatus: 'synced' }
          : card
      ));
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

      const snapshot = await pullSnapshotFromCloud();
      if (!snapshot) {
        setSyncState((prev) => ({ ...prev, isSyncing: false }));
        return {
          success: false,
          error: 'No cloud backup found for this account.',
        };
      }

      const [localCards, localCategories, localSettings, deletedEntityIds] = await Promise.all([
        storage.getAllCards(),
        storage.getAllCategories(),
        storage.getSettings(),
        storage.getDeletedEntityIds(),
      ]);

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

  return {
    syncState,
    syncToCloud,
    pullFromCloud,
    fullSync,
    uploadImage,
    mergeData,
    updatePendingCount,
    isEnabled: ENABLE_CLOUD_SYNC && isAuthenticated,
  };
}