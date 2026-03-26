import { useState, useEffect, useCallback, useRef } from 'react';
import type { Flashcard, Category, AppSettings } from '@/types/flashcard';
import { useOfflineStorage } from './useOfflineStorage';
import { useFlashcardSync, ENABLE_CLOUD_SYNC } from './useFlashcardSync';
import { toast } from 'sonner';

const generateClientId = (prefix: 'card' | 'cat') => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
};

const sortCategories = (items: Category[]) =>
  [...items].sort((a, b) => {
    const aOrder = a.order ?? Number.MAX_SAFE_INTEGER;
    const bOrder = b.order ?? Number.MAX_SAFE_INTEGER;
    if (aOrder !== bOrder) return aOrder - bOrder;
    const aCreated = a.createdAt ?? 0;
    const bCreated = b.createdAt ?? 0;
    return aCreated - bCreated;
  });

const VALID_CATEGORY_COLORS: Category['color'][] = ['coral', 'mint', 'sky', 'lavender', 'sunshine', 'peach'];
const VALID_THEMES: AppSettings['theme'][] = ['sunshine', 'ocean', 'berry'];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

export interface LocalBackupData {
  version: 1;
  exportedAt: string;
  categories: Category[];
  cards: Flashcard[];
  settings: AppSettings;
}

const SYNC_DEBOUNCE_MS = 8_000;


export function useFlashcards() {
  const storage = useOfflineStorage();
  const sync = useFlashcardSync();
  
  const [categories, setCategories] = useState<Category[]>([]);
  const [cards, setCards] = useState<Flashcard[]>([]);
  const [settings, setSettings] = useState<AppSettings>({
    autoPlayAudio: true,
    voiceSpeed: 'normal',
    repeatAudio: false,
    theme: 'sunshine',
    enableCloudSync: false,
  });
  const [isLoading, setIsLoading] = useState(true);
  
  const initialized = useRef(false);
  const cloudSyncTimer = useRef<number | null>(null);

  const refreshFromStorage = useCallback(async () => {
    const [loadedCategories, loadedCards, loadedSettings] = await Promise.all([
      storage.getAllCategories(),
      storage.getAllCards(),
      storage.getSettings(),
    ]);

    setCategories(sortCategories(loadedCategories));
    setCards(loadedCards);
    setSettings(loadedSettings);

    if (storage.consumeMigrationNotice()) {
      toast.success('Categories restored', { duration: 250 });
    }
  }, [storage]);

  const scheduleCloudSync = useCallback((delayMs: number = SYNC_DEBOUNCE_MS) => {
    if (!ENABLE_CLOUD_SYNC || !sync.isEnabled || !sync.syncState.isOnline) {
      return;
    }

    if (cloudSyncTimer.current !== null) {
      window.clearTimeout(cloudSyncTimer.current);
    }

    cloudSyncTimer.current = window.setTimeout(() => {
      cloudSyncTimer.current = null;
      void sync.syncToCloud();
    }, delayMs);
  }, [sync.isEnabled, sync.syncState.isOnline, sync.syncToCloud]);

  useEffect(() => {
    return () => {
      if (cloudSyncTimer.current !== null) {
        window.clearTimeout(cloudSyncTimer.current);
      }
    };
  }, []);

  // Load data from IndexedDB on mount
  useEffect(() => {
    const loadData = async () => {
      if (initialized.current) return;
      initialized.current = true;
      
      try {
        await refreshFromStorage();
      } catch (error) {
        console.error('Failed to load data from IndexedDB:', error);
        // Fall back to defaults
        setCategories(storage.DEFAULT_CATEGORIES);
        setCards(storage.DEFAULT_CARDS);
        setSettings(storage.DEFAULT_SETTINGS);
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [refreshFromStorage, storage]);

  const getCardsByCategory = useCallback(
    (categoryId: string) => cards.filter((card) => card.categoryId === categoryId),
    [cards]
  );

  const createLocalBackup = useCallback(async (): Promise<LocalBackupData> => {
    const [storedCategories, storedCards, storedSettings] = await Promise.all([
      storage.getAllCategories(),
      storage.getAllCards(),
      storage.getSettings(),
    ]);

    return {
      version: 1,
      exportedAt: new Date().toISOString(),
      categories: storedCategories,
      cards: storedCards,
      settings: { ...storage.DEFAULT_SETTINGS, ...storedSettings },
    };
  }, [storage]);

  const restoreLocalBackup = useCallback(async (payload: unknown) => {
    if (!isRecord(payload)) {
      throw new Error('Invalid backup file');
    }

    const rawCategories = Array.isArray(payload.categories) ? payload.categories : null;
    const rawCards = Array.isArray(payload.cards) ? payload.cards : null;
    const rawSettings = isRecord(payload.settings) ? payload.settings : null;

    if (!rawCategories || !rawCards || !rawSettings) {
      throw new Error('Backup is missing categories, cards, or settings');
    }

    const now = Date.now();
    const restoredCategories: Category[] = rawCategories
      .filter((item): item is Record<string, unknown> => isRecord(item))
      .map((item, index) => {
        const color = typeof item.color === 'string' && VALID_CATEGORY_COLORS.includes(item.color as Category['color'])
          ? (item.color as Category['color'])
          : 'coral';

        return {
          id: String(item.id ?? generateClientId('cat')),
          name: String(item.name ?? '').trim(),
          icon: String(item.icon ?? '📚'),
          color,
          order: typeof item.order === 'number' ? item.order : index,
          createdAt: typeof item.createdAt === 'number' ? item.createdAt : now,
          updatedAt: now,
          syncStatus: 'pending',
        };
      })
      .filter((category) => category.name.length > 0);

    if (restoredCategories.length === 0) {
      throw new Error('Backup has no valid categories');
    }

    const categoryIds = new Set(restoredCategories.map((category) => category.id));
    const restoredCards: Flashcard[] = rawCards
      .filter((item): item is Record<string, unknown> => isRecord(item))
      .map((item) => ({
        id: String(item.id ?? generateClientId('card')),
        word: String(item.word ?? '').trim(),
        imageUrl: String(item.imageUrl ?? '').trim(),
        categoryId: String(item.categoryId ?? ''),
        createdAt: typeof item.createdAt === 'number' ? item.createdAt : now,
        updatedAt: now,
        syncStatus: 'pending' as const,
      }))
      .filter((card) => card.word.length > 0 && card.imageUrl.length > 0 && categoryIds.has(card.categoryId));

    const restoredSettings: AppSettings = {
      autoPlayAudio: typeof rawSettings.autoPlayAudio === 'boolean'
        ? rawSettings.autoPlayAudio
        : storage.DEFAULT_SETTINGS.autoPlayAudio,
      voiceSpeed: rawSettings.voiceSpeed === 'slow' ? 'slow' : 'normal',
      repeatAudio: typeof rawSettings.repeatAudio === 'boolean'
        ? rawSettings.repeatAudio
        : storage.DEFAULT_SETTINGS.repeatAudio,
      theme: typeof rawSettings.theme === 'string' && VALID_THEMES.includes(rawSettings.theme as AppSettings['theme'])
        ? (rawSettings.theme as AppSettings['theme'])
        : storage.DEFAULT_SETTINGS.theme,
      enableCloudSync: typeof rawSettings.enableCloudSync === 'boolean'
        ? rawSettings.enableCloudSync
        : storage.DEFAULT_SETTINGS.enableCloudSync,
    };

    const orderedCategories = sortCategories(restoredCategories);

    setCategories(orderedCategories);
    setCards(restoredCards);
    setSettings(restoredSettings);

    await Promise.all([
      storage.saveAllCategories(orderedCategories),
      storage.saveAllCards(restoredCards),
      storage.saveSettings(restoredSettings),
    ]);

    await sync.updatePendingCount();

    return {
      categories: orderedCategories.length,
      cards: restoredCards.length,
    };
  }, [storage, sync]);

  const addCard = useCallback(async (card: Omit<Flashcard, 'id'>, imageBlob?: Blob) => {
    const now = Date.now();
    const newCard: Flashcard = {
      ...card,
      id: generateClientId('card'),
      createdAt: now,
      updatedAt: now,
      syncStatus: 'pending',
    };
    
    // Store blob in cache if provided for efficient upload
    if (imageBlob) {
      sync.setCardImageBlob(newCard.id, imageBlob);
      // Also save blob to offline storage for display
      storage.saveImage(newCard.id, imageBlob);
    }
    
    const updatedCards = [...cards, newCard];
    setCards(updatedCards);
    
    // Save to IndexedDB (non-blocking for UI)
    storage.saveAllCards(updatedCards).then(() => {
      sync.updatePendingCount();
      // Trigger background sync if enabled
      if (ENABLE_CLOUD_SYNC && sync.syncState.isOnline) {
        scheduleCloudSync();
      }
    });
    
    return newCard;
  }, [cards, storage, sync, scheduleCloudSync]);

  const updateCard = useCallback(async (id: string, updates: Partial<Omit<Flashcard, 'id'>>, imageBlob?: Blob) => {
    const updatedCards = cards.map((card) =>
      card.id === id
        ? { ...card, ...updates, updatedAt: Date.now(), syncStatus: 'pending' as const }
        : card
    );
    
    // Store blob in cache if provided for efficient upload
    if (imageBlob) {
      sync.setCardImageBlob(id, imageBlob);
      // Also save blob to offline storage for display
      storage.saveImage(id, imageBlob);
    }
    
    setCards(updatedCards);
    
    // Save to IndexedDB
    storage.saveAllCards(updatedCards).then(() => {
      sync.updatePendingCount();
      if (ENABLE_CLOUD_SYNC && sync.syncState.isOnline) {
        scheduleCloudSync();
      }
    });
  }, [cards, storage, sync, scheduleCloudSync]);

  const deleteCard = useCallback(async (id: string) => {
    const updatedCards = cards.filter((card) => card.id !== id);
    setCards(updatedCards);

    // Delete from IndexedDB
    Promise.all([
      storage.deleteCard(id),
      storage.markCardDeleted(id),
    ]).then(() => {
      sync.updatePendingCount();
    });
  }, [cards, storage, sync]);

  const addCategory = useCallback(async (category: Omit<Category, 'id'>) => {
    const now = Date.now();
    const maxOrder = categories.reduce((max, cat) => Math.max(max, cat.order ?? -1), -1);
    const newCategory: Category = {
      ...category,
      id: generateClientId('cat'),
      order: maxOrder + 1,
      createdAt: now,
      updatedAt: now,
      syncStatus: 'pending',
    };
    
    const updatedCategories = [...categories, newCategory];
    setCategories(updatedCategories);
    
    storage.saveAllCategories(updatedCategories).then(() => {
      sync.updatePendingCount();
      if (ENABLE_CLOUD_SYNC && sync.syncState.isOnline) {
        scheduleCloudSync();
      }
    });
    
    return newCategory;
  }, [categories, storage, sync, scheduleCloudSync]);

  const updateCategory = useCallback(async (id: string, updates: Partial<Omit<Category, 'id'>>) => {
    const updatedCategories = sortCategories(categories.map((cat) =>
      cat.id === id
        ? { ...cat, ...updates, updatedAt: Date.now(), syncStatus: 'pending' as const }
        : cat
    ));
    setCategories(updatedCategories);
    
    storage.saveAllCategories(updatedCategories).then(() => {
      sync.updatePendingCount();
      if (ENABLE_CLOUD_SYNC && sync.syncState.isOnline) {
        scheduleCloudSync();
      }
    });
  }, [categories, storage, sync, scheduleCloudSync]);

  const deleteCategory = useCallback(async (id: string) => {
    const updatedCategories = sortCategories(categories.filter((cat) => cat.id !== id));
    setCategories(updatedCategories);

    // Also delete all cards in this category
    const cardsInCategory = cards.filter((card) => card.categoryId === id);
    const updatedCards = cards.filter((card) => card.categoryId !== id);
    setCards(updatedCards);

    Promise.all([
      storage.saveAllCategories(updatedCategories),
      storage.saveAllCards(updatedCards),
      storage.markCategoryDeleted(id),
      ...cardsInCategory.map((card) => storage.markCardDeleted(card.id)),
    ]).then(() => {
      sync.updatePendingCount();
    });
  }, [categories, cards, storage, sync]);

  const reorderCategories = useCallback(async (categoryIds: string[]) => {
    const now = Date.now();
    const orderMap = new Map(categoryIds.map((id, index) => [id, index]));
    const updatedCategories = sortCategories(
      categories.map((cat) => {
        const nextOrder = orderMap.get(cat.id);
        if (nextOrder === undefined) return cat;
        return {
          ...cat,
          order: nextOrder,
          updatedAt: now,
          syncStatus: 'pending' as const,
        };
      })
    );

    setCategories(updatedCategories);
    storage.saveAllCategories(updatedCategories).then(() => {
      sync.updatePendingCount();
      if (ENABLE_CLOUD_SYNC && sync.syncState.isOnline) {
        scheduleCloudSync();
      }
    });
  }, [categories, storage, sync, scheduleCloudSync]);

  const updateSettings = useCallback(async (updates: Partial<AppSettings>) => {
    const newSettings = { ...settings, ...updates };
    setSettings(newSettings);
    storage.saveSettings(newSettings);
  }, [settings, storage]);

  const resetToDefaults = useCallback(async () => {
    setCategories(storage.DEFAULT_CATEGORIES);
    setCards(storage.DEFAULT_CARDS);
    setSettings(storage.DEFAULT_SETTINGS);
    await storage.resetToDefaults();
  }, [storage]);

  // Save local image and optionally sync to cloud
  const saveCardImage = useCallback(async (cardId: string, imageData: string): Promise<string> => {
    // Always save locally first
    await storage.saveImage(cardId, imageData);
    
    // Return local data URL for immediate use
    // If cloud sync is enabled, it will upload in background
    if (ENABLE_CLOUD_SYNC && sync.syncState.isOnline) {
      sync.uploadImage(cardId, imageData);
    }
    
    return imageData;
  }, [storage, sync]);

  // Get image, preferring local cache
  const getCardImage = useCallback(async (cardId: string): Promise<string | undefined> => {
    return storage.getImage(cardId);
  }, [storage]);

  return {
    categories,
    cards,
    settings,
    isLoading,
    getCardsByCategory,
    addCard,
    updateCard,
    deleteCard,
    addCategory,
    updateCategory,
    reorderCategories,
    deleteCategory,
    updateSettings,
    resetToDefaults,
    // Image operations
    saveCardImage,
    getCardImage,
    createLocalBackup,
    restoreLocalBackup,
    refreshFromStorage,
    // Sync state and operations
    syncState: sync.syncState,
    syncToCloud: sync.syncToCloud,
    pullFromCloud: sync.pullFromCloud,
    fullSync: sync.fullSync,
    isCloudSyncEnabled: sync.isEnabled,
  };
}
