import { account, databases, storage, DATABASE_ID, COLLECTION_IDS, BUCKET_ID, APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID } from '@/lib/appwrite';
import type { AppSettings, Category, Flashcard } from '@/types/flashcard';

const CLOUD_PREFS_KEY = 'flashcardCloudData';

export interface CloudSnapshot {
  version: 1;
  updatedAt: number;
  cards: Flashcard[];
  categories: Category[];
  settings: AppSettings;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

// Helper function to get image URL from storage
const getImageUrlFromStorage = (fileId: string, projectId: string, endpointUrl: string): string => {
  return `${endpointUrl}/storage/buckets/${BUCKET_ID}/files/${fileId}/preview?project=${projectId}&width=200&height=200&gravity=center`;
};

const normalizeCards = (raw: unknown, projectId?: string, endpointUrl?: string): Flashcard[] => {
  if (!Array.isArray(raw)) return [];

  return raw
    .filter((item): item is Record<string, unknown> => isRecord(item))
    .map((item) => {
      // Reconstruct imageUrl from fileId if present
      let imageUrl = String(item.imageUrl ?? '');
      if (!imageUrl && item.imageFileId && projectId && endpointUrl) {
        imageUrl = getImageUrlFromStorage(String(item.imageFileId), projectId, endpointUrl);
      }
      
      return {
        id: String(item.id ?? ''),
        word: String(item.word ?? ''),
        imageUrl,
        imageFileId: item.imageFileId ? String(item.imageFileId) : undefined,
        categoryId: String(item.categoryId ?? ''),
        createdAt: typeof item.createdAt === 'number' ? item.createdAt : Date.now(),
        updatedAt: typeof item.updatedAt === 'number' ? item.updatedAt : Date.now(),
        syncStatus: 'synced' as const,
      };
    })
    .filter((card) => card.id && card.word && card.categoryId && (card.imageUrl || card.imageFileId));
};

const normalizeCategories = (raw: unknown): Category[] => {
  if (!Array.isArray(raw)) return [];

  const allowedColors: Category['color'][] = ['coral', 'mint', 'sky', 'lavender', 'sunshine', 'peach'];

  return raw
    .filter((item): item is Record<string, unknown> => isRecord(item))
    .map((item, index) => {
      const color = typeof item.color === 'string' && allowedColors.includes(item.color as Category['color'])
        ? (item.color as Category['color'])
        : 'coral';

      return {
        id: String(item.id ?? ''),
        name: String(item.name ?? ''),
        icon: String(item.icon ?? '📚'),
        color,
        order: typeof item.order === 'number' ? item.order : index,
        createdAt: typeof item.createdAt === 'number' ? item.createdAt : Date.now(),
        updatedAt: typeof item.updatedAt === 'number' ? item.updatedAt : Date.now(),
        syncStatus: 'synced' as const,
      };
    })
    .filter((category) => category.id && category.name);
};

const normalizeSettings = (raw: unknown): AppSettings => {
  const defaults: AppSettings = {
    autoPlayAudio: true,
    voiceSpeed: 'normal',
    repeatAudio: false,
    theme: 'sunshine',
    enableCloudSync: true,
  };

  if (!isRecord(raw)) {
    return defaults;
  }

  return {
    autoPlayAudio: typeof raw.autoPlayAudio === 'boolean' ? raw.autoPlayAudio : defaults.autoPlayAudio,
    voiceSpeed: raw.voiceSpeed === 'slow' ? 'slow' : 'normal',
    repeatAudio: typeof raw.repeatAudio === 'boolean' ? raw.repeatAudio : defaults.repeatAudio,
    theme: raw.theme === 'ocean' || raw.theme === 'berry' ? raw.theme : 'sunshine',
    enableCloudSync: true,
  };
};

const parseSnapshot = (raw: unknown): CloudSnapshot | null => {
  if (!isRecord(raw)) {
    return null;
  }

  return {
    version: 1,
    updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : Date.now(),
    cards: normalizeCards(raw.cards),
    categories: normalizeCategories(raw.categories),
    settings: normalizeSettings(raw.settings),
  };
};

// Helper function to upload image to storage and get file ID
const uploadImageToStorage = async (cardId: string, imageUrl: string): Promise<string | null> => {
  try {
    // Skip if imageUrl is not a data URL (already uploaded or external)
    if (!imageUrl || !imageUrl.startsWith('data:')) {
      return null;
    }

    // Convert data URL to blob
    let blob: Blob;
    if (typeof imageUrl === 'string' && imageUrl.startsWith('data:')) {
      const response = await fetch(imageUrl);
      if (!response.ok) {
        console.warn(`Failed to fetch image for card ${cardId}: ${response.statusText}`);
        return null;
      }
      blob = await response.blob();
      
      if (!blob || blob.size === 0) {
        console.warn(`Empty blob for card ${cardId}`);
        return null;
      }
    } else {
      return null;
    }

    // Upload to Appwrite Storage
    const file = await storage.createFile(BUCKET_ID, cardId, blob);
    return file.$id;
  } catch (error) {
    console.warn(`Failed to upload image for card ${cardId}:`, error);
    return null;
  }
};

export async function pushSnapshotToCloud(snapshot: CloudSnapshot): Promise<void> {
  try {
    // Get current user ID
    const user = await account.get();
    const userId = user.$id;

    // Push cards to database
    for (const card of snapshot.cards) {
      try {
        // Handle imageUrl and imageFileId
        let imageFileId: string | null = null;
        let imageUrl = 'image'; // Default placeholder
        
        // Try to upload data URL to storage
        if (card.imageUrl && card.imageUrl.startsWith('data:')) {
          imageFileId = await uploadImageToStorage(card.id, card.imageUrl);
        }
        
        // Set imageUrl: use original if it's not a data URL and fits, else use placeholder
        if (card.imageUrl && !card.imageUrl.startsWith('data:') && card.imageUrl.length < 200000) {
          imageUrl = card.imageUrl;
        } else if (imageFileId) {
          imageUrl = getImageUrlFromStorage(imageFileId, APPWRITE_PROJECT_ID, APPWRITE_ENDPOINT);
        }
        // else: keep default 'image' placeholder
        
        await databases.createDocument(
          DATABASE_ID,
          COLLECTION_IDS.cards,
          card.id,
          {
            userId,
            word: card.word,
            imageUrl, // Always included (required field)
            imageFileId: imageFileId || undefined,
            categoryId: card.categoryId,
          createdAt: card.createdAt,
          updatedAt: card.updatedAt,
          syncStatus: card.syncStatus,
        }
      );
    }

    // Push categories to database
    for (const category of snapshot.categories) {
      await databases.createDocument(
        DATABASE_ID,
        COLLECTION_IDS.categories,
        category.id,
        {
          userId,
          name: category.name,
          icon: category.icon,
          color: category.color,
          order: category.order,
          createdAt: category.createdAt,
          updatedAt: category.updatedAt,
          syncStatus: category.syncStatus,
        }
      );
    }

    // Fallback: also store in account prefs for backward compatibility
    try {
      const prefs = (await account.getPrefs()) as Record<string, unknown>;
      await account.updatePrefs({
        ...prefs,
        [CLOUD_PREFS_KEY]: JSON.stringify(snapshot),
      });
    } catch (prefsError) {
      console.warn('Could not update account prefs:', prefsError);
      // Don't fail if prefs update fails, database sync is primary
    }
  } catch (error) {
    console.error('Error pushing snapshot to cloud:', error);
    throw error;
  }
}

export async function pullSnapshotFromCloud(
  localCards: Flashcard[] = [],
  localCategories: Category[] = []
): Promise<CloudSnapshot | null> {
  try {
    // Get current user ID for filtering
    const user = await account.get();
    const userId = user.$id;

    // Create sets of existing local IDs for quick lookup
    const localCardIds = new Set(localCards.map((card) => card.id));
    const localCategoryIds = new Set(localCategories.map((cat) => cat.id));

    // Try to pull from database first
    const cardsResponse = await databases.listDocuments(DATABASE_ID, COLLECTION_IDS.cards);
    const categoriesResponse = await databases.listDocuments(DATABASE_ID, COLLECTION_IDS.categories);

    // Filter to only cards and categories not available locally
    const cards = normalizeCards(
      cardsResponse.documents
        .filter((doc) => doc.userId === userId && !localCardIds.has(doc.$id))
        .map((doc) => ({
          id: doc.$id,
          ...doc,
        })),
      APPWRITE_PROJECT_ID,
      APPWRITE_ENDPOINT
    );

    const categories = normalizeCategories(
      categoriesResponse.documents
        .filter((doc) => doc.userId === userId && !localCategoryIds.has(doc.$id))
        .map((doc) => ({
          id: doc.$id,
          ...doc,
        }))
    );

    return {
      version: 1,
      updatedAt: Date.now(),
      cards,
      categories,
      settings: normalizeSettings({}),
    };
  } catch (error) {
    console.warn('Error pulling from database, falling back to account prefs:', error);
    
    // Fallback to account prefs for backward compatibility
    const prefs = (await account.getPrefs()) as Record<string, unknown>;
    const prefsData = prefs[CLOUD_PREFS_KEY];
    
    // Handle both stringified and non-stringified prefs for backward compatibility
    let snapshotData = prefsData;
    if (typeof prefsData === 'string') {
      try {
        snapshotData = JSON.parse(prefsData);
      } catch {
        return null;
      }
    }
    
    return parseSnapshot(snapshotData);
  }
}
