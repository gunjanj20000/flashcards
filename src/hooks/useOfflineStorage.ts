 import { get, set, del, keys, createStore } from 'idb-keyval';
 import { useCallback } from 'react';
 import type { Flashcard, Category, AppSettings } from '@/types/flashcard';

const DB_NAME = 'flashcards-db';
const REQUIRED_STORES = ['flashcards', 'categories', 'images', 'settings'] as const;

let ensureStoresPromise: Promise<void> | null = null;

const openDatabase = (version?: number): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const request = version === undefined ? indexedDB.open(DB_NAME) : indexedDB.open(DB_NAME, version);

    request.onupgradeneeded = () => {
      const db = request.result;
      REQUIRED_STORES.forEach((storeName) => {
        if (!db.objectStoreNames.contains(storeName)) {
          db.createObjectStore(storeName);
        }
      });
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(request.error ?? new Error('Failed to open IndexedDB'));
    };
  });

const ensureObjectStores = async (): Promise<void> => {
  if (typeof indexedDB === 'undefined') {
    return;
  }

  if (!ensureStoresPromise) {
    ensureStoresPromise = (async () => {
      const db = await openDatabase();
      const hasAllStores = REQUIRED_STORES.every((storeName) => db.objectStoreNames.contains(storeName));

      if (hasAllStores) {
        db.close();
        return;
      }

      const targetVersion = db.version + 1;
      db.close();

      const upgradedDb = await openDatabase(targetVersion);
      upgradedDb.close();
    })();
  }

  try {
    await ensureStoresPromise;
  } catch (error) {
    ensureStoresPromise = null;
    throw error;
  }
};

const isMissingObjectStoreError = (error: unknown): boolean => {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return message.includes('object store') && (
    message.includes('not a known') ||
    message.includes('not found') ||
    message.includes('no objectstore')
  );
};

const withStoreRecovery = async <T>(operation: () => Promise<T>): Promise<T> => {
  try {
    await ensureObjectStores();
    return await operation();
  } catch (error) {
    if (!isMissingObjectStoreError(error)) {
      throw error;
    }

    ensureStoresPromise = null;
    await ensureObjectStores();
    return operation();
  }
};

 const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

 const isUuid = (value: string) => UUID_REGEX.test(value);

 const generateClientId = (prefix: 'card' | 'cat') => {
   if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
     return crypto.randomUUID();
   }

   return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
 };

 const createDefaultCategories = (): Category[] => {
   // No default categories - users start with empty app
   return [];
 };
 
 // Create separate stores for different data types
 const flashcardsStore = createStore(DB_NAME, 'flashcards');
 const categoriesStore = createStore(DB_NAME, 'categories');
 const imagesStore = createStore(DB_NAME, 'images');
 const settingsStore = createStore(DB_NAME, 'settings');
 
 const STORAGE_KEYS = {
   ALL_CARDS: 'all_cards',
   ALL_CATEGORIES: 'all_categories',
   SETTINGS: 'app_settings',
  DELETED_ENTITY_IDS: 'deleted_entity_ids',
 };

interface DeletedEntityIds {
  cardIds: string[];
  categoryIds: string[];
}

const DEFAULT_DELETED_ENTITY_IDS: DeletedEntityIds = {
  cardIds: [],
  categoryIds: [],
};

let hasUnseenMigration = false;
 
 const DEFAULT_CATEGORIES: Category[] = createDefaultCategories();
 
const DEFAULT_CARDS: Flashcard[] = [];
 
 const DEFAULT_SETTINGS: AppSettings = {
   autoPlayAudio: true,
   voiceSpeed: 'normal',
   repeatAudio: false,
  theme: 'sunshine',
   enableCloudSync: false,
 };
 
 export function useOfflineStorage() {
   // Cards operations
   const getAllCards = useCallback(async (): Promise<Flashcard[]> => {
     try {
      const cards = await withStoreRecovery(() => get<Flashcard[]>(STORAGE_KEYS.ALL_CARDS, flashcardsStore));
       if (!cards) {
         // Initialize with defaults
        await withStoreRecovery(() => set(STORAGE_KEYS.ALL_CARDS, DEFAULT_CARDS, flashcardsStore));
         return DEFAULT_CARDS;
       }
       return cards;
     } catch (error) {
       console.error('Failed to get cards from IndexedDB:', error);
       return DEFAULT_CARDS;
     }
   }, []);
 
   const saveAllCards = useCallback(async (cards: Flashcard[]): Promise<void> => {
     try {
      await withStoreRecovery(() => set(STORAGE_KEYS.ALL_CARDS, cards, flashcardsStore));
     } catch (error) {
       console.error('Failed to save cards to IndexedDB:', error);
     }
   }, []);
 
   const saveCard = useCallback(async (card: Flashcard): Promise<void> => {
     const cards = await getAllCards();
     const index = cards.findIndex(c => c.id === card.id);
     if (index >= 0) {
       cards[index] = card;
     } else {
       cards.push(card);
     }
     await saveAllCards(cards);
   }, [getAllCards, saveAllCards]);
 
   const deleteCard = useCallback(async (cardId: string): Promise<void> => {
     const cards = await getAllCards();
     const filtered = cards.filter(c => c.id !== cardId);
     await saveAllCards(filtered);
     // Also delete associated image if stored locally
     try {
      await withStoreRecovery(() => del(cardId, imagesStore));
     } catch (error) {
       // Image may not exist locally
     }
   }, [getAllCards, saveAllCards]);
 
   const saveAllCategories = useCallback(async (categories: Category[]): Promise<void> => {
     try {
      await withStoreRecovery(() => set(STORAGE_KEYS.ALL_CATEGORIES, categories, categoriesStore));
     } catch (error) {
       console.error('Failed to save categories to IndexedDB:', error);
     }
   }, []);

   // Categories operations
   const getAllCategories = useCallback(async (): Promise<Category[]> => {
     try {
      const categories = await withStoreRecovery(() =>
        get<Category[]>(STORAGE_KEYS.ALL_CATEGORIES, categoriesStore)
      );
       if (!categories) {
        await withStoreRecovery(() =>
          set(STORAGE_KEYS.ALL_CATEGORIES, DEFAULT_CATEGORIES, categoriesStore)
        );
         return DEFAULT_CATEGORIES;
       }

       const hasLegacyCategoryIds = categories.some((category) => !isUuid(category.id));
       if (!hasLegacyCategoryIds) {
         return categories;
       }

       const now = Date.now();
       const categoryIdMap = new Map<string, string>();
       const migratedCategories = categories.map((category) => {
         if (isUuid(category.id)) {
           return category;
         }

         const migratedId = generateClientId('cat');
         categoryIdMap.set(category.id, migratedId);

         return {
           ...category,
           id: migratedId,
           updatedAt: now,
           syncStatus: 'pending' as const,
         };
       });

       const cards = await getAllCards();
       const hasLegacyCards = cards.some(
         (card) => !isUuid(card.id) || categoryIdMap.has(card.categoryId)
       );

       const migratedCards = hasLegacyCards
         ? cards.map((card) => {
             let didChange = false;
             let nextId = card.id;

             if (!isUuid(card.id)) {
               nextId = generateClientId('card');
               didChange = true;
             }

             const mappedCategoryId = categoryIdMap.get(card.categoryId);
             const nextCategoryId = mappedCategoryId ?? card.categoryId;
             if (nextCategoryId !== card.categoryId) {
               didChange = true;
             }

             if (!didChange) {
               return card;
             }

             return {
               ...card,
               id: nextId,
               categoryId: nextCategoryId,
               updatedAt: now,
               syncStatus: 'pending' as const,
             };
           })
         : cards;

       await Promise.all([
         saveAllCategories(migratedCategories),
         hasLegacyCards ? saveAllCards(migratedCards) : Promise.resolve(),
       ]);

       hasUnseenMigration = true;

       return migratedCategories;
     } catch (error) {
       console.error('Failed to get categories from IndexedDB:', error);
       return DEFAULT_CATEGORIES;
     }
   }, [getAllCards, saveAllCards, saveAllCategories]);
 
   const saveCategory = useCallback(async (category: Category): Promise<void> => {
     const categories = await getAllCategories();
     const index = categories.findIndex(c => c.id === category.id);
     if (index >= 0) {
       categories[index] = category;
     } else {
       categories.push(category);
     }
     await saveAllCategories(categories);
   }, [getAllCategories, saveAllCategories]);
 
   const deleteCategory = useCallback(async (categoryId: string): Promise<void> => {
     const categories = await getAllCategories();
     const filtered = categories.filter(c => c.id !== categoryId);
     await saveAllCategories(filtered);
   }, [getAllCategories, saveAllCategories]);
 
   // Settings operations
   const getSettings = useCallback(async (): Promise<AppSettings> => {
     try {
      const settings = await withStoreRecovery(() =>
        get<AppSettings>(STORAGE_KEYS.SETTINGS, settingsStore)
      );
       if (!settings) {
        await withStoreRecovery(() => set(STORAGE_KEYS.SETTINGS, DEFAULT_SETTINGS, settingsStore));
         return DEFAULT_SETTINGS;
       }
      return { ...DEFAULT_SETTINGS, ...settings };
     } catch (error) {
       console.error('Failed to get settings from IndexedDB:', error);
       return DEFAULT_SETTINGS;
     }
   }, []);
 
   const saveSettings = useCallback(async (settings: AppSettings): Promise<void> => {
     try {
      await withStoreRecovery(() => set(STORAGE_KEYS.SETTINGS, settings, settingsStore));
     } catch (error) {
       console.error('Failed to save settings to IndexedDB:', error);
     }
   }, []);
 
   // Image operations (store blobs locally for efficiency)
   const saveImage = useCallback(async (cardId: string, imageBlob: Blob): Promise<void> => {
     try {
      await withStoreRecovery(() => set(cardId, imageBlob, imagesStore));
     } catch (error) {
       console.error('Failed to save image blob to IndexedDB:', error);
     }
   }, []);
 
   const getImage = useCallback(async (cardId: string): Promise<Blob | undefined> => {
     try {
      return await withStoreRecovery(() => get<Blob>(cardId, imagesStore));
     } catch (error) {
       console.error('Failed to get image blob from IndexedDB:', error);
       return undefined;
     }
   }, []);
 
   const deleteImage = useCallback(async (cardId: string): Promise<void> => {
     try {
      await withStoreRecovery(() => del(cardId, imagesStore));
     } catch (error) {
       console.error('Failed to delete image from IndexedDB:', error);
     }
   }, []);

  const getDeletedEntityIds = useCallback(async (): Promise<DeletedEntityIds> => {
    try {
      const value = await withStoreRecovery(() =>
        get<DeletedEntityIds>(STORAGE_KEYS.DELETED_ENTITY_IDS, settingsStore)
      );

      if (!value) {
        await withStoreRecovery(() =>
          set(STORAGE_KEYS.DELETED_ENTITY_IDS, DEFAULT_DELETED_ENTITY_IDS, settingsStore)
        );
        return DEFAULT_DELETED_ENTITY_IDS;
      }

      return {
        cardIds: Array.isArray(value.cardIds) ? value.cardIds : [],
        categoryIds: Array.isArray(value.categoryIds) ? value.categoryIds : [],
      };
    } catch (error) {
      console.error('Failed to get deleted entity ids from IndexedDB:', error);
      return DEFAULT_DELETED_ENTITY_IDS;
    }
  }, []);

  const saveDeletedEntityIds = useCallback(async (payload: DeletedEntityIds): Promise<void> => {
    try {
      await withStoreRecovery(() =>
        set(STORAGE_KEYS.DELETED_ENTITY_IDS, payload, settingsStore)
      );
    } catch (error) {
      console.error('Failed to save deleted entity ids to IndexedDB:', error);
    }
  }, []);

  const markCardDeleted = useCallback(async (cardId: string): Promise<void> => {
    const deleted = await getDeletedEntityIds();
    if (deleted.cardIds.includes(cardId)) {
      return;
    }

    await saveDeletedEntityIds({
      ...deleted,
      cardIds: [...deleted.cardIds, cardId],
    });
  }, [getDeletedEntityIds, saveDeletedEntityIds]);

  const markCategoryDeleted = useCallback(async (categoryId: string): Promise<void> => {
    const deleted = await getDeletedEntityIds();
    if (deleted.categoryIds.includes(categoryId)) {
      return;
    }

    await saveDeletedEntityIds({
      ...deleted,
      categoryIds: [...deleted.categoryIds, categoryId],
    });
  }, [getDeletedEntityIds, saveDeletedEntityIds]);

  const clearDeletedEntityIds = useCallback(async (payload?: Partial<DeletedEntityIds>): Promise<void> => {
    const deleted = await getDeletedEntityIds();
    const cardIdsToClear = new Set(payload?.cardIds ?? deleted.cardIds);
    const categoryIdsToClear = new Set(payload?.categoryIds ?? deleted.categoryIds);

    await saveDeletedEntityIds({
      cardIds: deleted.cardIds.filter((id) => !cardIdsToClear.has(id)),
      categoryIds: deleted.categoryIds.filter((id) => !categoryIdsToClear.has(id)),
    });
  }, [getDeletedEntityIds, saveDeletedEntityIds]);
 
   // Get all pending items for sync
   const getPendingCards = useCallback(async (): Promise<Flashcard[]> => {
     const cards = await getAllCards();
     return cards.filter(c => c.syncStatus === 'pending');
   }, [getAllCards]);
 
   const getPendingCategories = useCallback(async (): Promise<Category[]> => {
     const categories = await getAllCategories();
     return categories.filter(c => c.syncStatus === 'pending');
   }, [getAllCategories]);
 
   // Reset to defaults
   const resetToDefaults = useCallback(async (): Promise<void> => {
     await saveAllCards(DEFAULT_CARDS);
     await saveAllCategories(DEFAULT_CATEGORIES);
     await saveSettings(DEFAULT_SETTINGS);
    await saveDeletedEntityIds(DEFAULT_DELETED_ENTITY_IDS);
  }, [saveAllCards, saveAllCategories, saveSettings, saveDeletedEntityIds]);

   const consumeMigrationNotice = useCallback((): boolean => {
     if (!hasUnseenMigration) {
       return false;
     }

     hasUnseenMigration = false;
     return true;
   }, []);
 
   return {
     // Cards
     getAllCards,
     saveAllCards,
     saveCard,
     deleteCard,
     getPendingCards,
     // Categories
     getAllCategories,
     saveAllCategories,
     saveCategory,
     deleteCategory,
     getPendingCategories,
     // Settings
     getSettings,
     saveSettings,
     // Images
     saveImage,
     getImage,
     deleteImage,
    // Deletion tracking
    getDeletedEntityIds,
    markCardDeleted,
    markCategoryDeleted,
    clearDeletedEntityIds,
     // Utils
     resetToDefaults,
     consumeMigrationNotice,
     DEFAULT_CARDS,
     DEFAULT_CATEGORIES,
     DEFAULT_SETTINGS,
   };
 }