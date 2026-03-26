import { account, databases, storage, DATABASE_ID, COLLECTION_IDS, BUCKET_ID, APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID } from '@/lib/appwrite';
import type { AppSettings, Category, Flashcard } from '@/types/flashcard';

const CLOUD_PREFS_KEY = 'flashcardCloudData';

/**
 * DEDUPLICATION STRATEGY:
 * 
 * 1. APP LEVEL:
 *    - dedupeByLatest in useFlashcardSync ensures only one version of each item (by ID) is kept
 *    - Items are merged by selecting the version with the latest updatedAt timestamp
 * 
 * 2. STORAGE LEVEL (Appwrite):
 *    - File IDs are card IDs - uploading with same ID replaces the file
 *    - Existing files are deleted before upload to avoid duplicates
 * 
 * 3. PULL LEVEL (by ID):
 *    - Only cards/categories not in local storage (by ID) are pulled
 *    - Cloud documents are filtered by userId for multi-user support
 * 
 * 4. PUSH/PULL LEVEL (by NAME):
 *    - Before pushing: Skip cards/categories that have the same name in cloud (case-insensitive)
 *    - Before pulling: Skip cards/categories that have the same name locally (case-insensitive)
 *    - Prevents semantic duplicates even if IDs differ
 */

export interface CloudSnapshot {
  version: 1;
  updatedAt: number;
  cards: Flashcard[];
  categories: Category[];
  settings: AppSettings;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

// Helper to create or update document (upsert)
const createOrUpdateDocument = async (
  dbId: string,
  collectionId: string,
  docId: string,
  data: Record<string, unknown>
): Promise<void> => {
  try {
    // Try to update first
    await databases.updateDocument(dbId, collectionId, docId, data);
  } catch (error: unknown) {
    // If document doesn't exist (404), create it
    const err = error as { code?: number; response?: { code: number } };
    if (err.code === 404 || err.response?.code === 404) {
      await databases.createDocument(dbId, collectionId, docId, data);
    } else {
      throw error;
    }
  }
};

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
// Helper to compress image blob to fit within Appwrite limits
const compressImage = async (blob: Blob, maxSizeBytes: number = 500000): Promise<Blob> => {
  // If already small enough, return as is
  if (blob.size <= maxSizeBytes) {
    console.log(`[compressImage] Blob is ${blob.size} bytes, no compression needed`);
    return blob;
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(blob);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let quality = 0.8;
        let scale = 1;

        const tryCompress = () => {
          canvas.width = img.width * scale;
          canvas.height = img.height * scale;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            console.warn('[compressImage] Failed to get canvas context');
            resolve(blob);
            return;
          }
          
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          
          canvas.toBlob((compressedBlob) => {
            if (!compressedBlob) {
              console.warn('[compressImage] Failed to create blob from canvas');
              resolve(blob);
              return;
            }

            console.log(`[compressImage] Attempt: quality=${quality.toFixed(2)}, scale=${scale.toFixed(2)}, size=${compressedBlob.size} bytes`);
            
            if (compressedBlob.size <= maxSizeBytes) {
              console.log(`[compressImage] Success! Compressed to ${compressedBlob.size} bytes (${Math.round(compressedBlob.size / 1024)}KB)`);
              resolve(compressedBlob);
              return;
            }

            // Try reducing quality first
            if (quality > 0.1) {
              quality -= 0.1;
              tryCompress();
            } 
            // Then reduce dimensions
            else if (scale > 0.3) {
              scale -= 0.1;
              quality = 0.8;
              tryCompress();
            } 
            // Give up and use what we have
            else {
              console.warn(`[compressImage] Could not compress below ${maxSizeBytes} bytes, using best effort (${compressedBlob.size} bytes)`);
              resolve(compressedBlob);
            }
          }, 'image/jpeg', quality);
        };

        tryCompress();
      };
      img.onerror = () => {
        console.warn('[compressImage] Failed to load image from data URL');
        resolve(blob);
      };
    };
    reader.onerror = () => {
      console.warn('[compressImage] Failed to read blob as data URL');
      resolve(blob);
    };
  });
};

// Helper to upload or replace image in storage
// Uses card ID as file ID, so re-uploading replaces the existing file
// Prevents duplicate files for the same card
const uploadImageToStorage = async (cardId: string, imageUrl: string): Promise<string | null> => {
  try {
    console.log(`[uploadImageToStorage] Starting upload for card ${cardId}`);
    
    // Skip if imageUrl is not a data URL (already uploaded or external)
    if (!imageUrl || !imageUrl.startsWith('data:')) {
      console.log(`[uploadImageToStorage] Skipping: not a data URL`);
      return null;
    }

    // Convert data URL to blob
    let blob: Blob;
    if (typeof imageUrl === 'string' && imageUrl.startsWith('data:')) {
      console.log(`[uploadImageToStorage] Fetching data URL for card ${cardId}`);
      const response = await fetch(imageUrl);
      if (!response.ok) {
        console.warn(`[uploadImageToStorage] Failed to fetch image for card ${cardId}: ${response.statusText}`);
        return null;
      }
      blob = await response.blob();
      console.log(`[uploadImageToStorage] Original blob size for card ${cardId}: ${blob.size} bytes`);
      
      if (!blob || blob.size === 0) {
        console.warn(`[uploadImageToStorage] Empty blob for card ${cardId}`);
        return null;
      }

      // Compress image if needed
      blob = await compressImage(blob, 500000); // Max 500KB
      console.log(`[uploadImageToStorage] Final blob size for card ${cardId}: ${blob.size} bytes`);
    } else {
      return null;
    }

    // Try to remove existing file first to avoid duplicates
    try {
      console.log(`[uploadImageToStorage] Deleting existing file for card ${cardId}`);
      await storage.deleteFile(BUCKET_ID, cardId);
      console.log(`[uploadImageToStorage] Deleted existing file for card ${cardId}`);
    } catch (e) {
      // File doesn't exist yet, that's fine
      console.log(`[uploadImageToStorage] No existing file to delete for card ${cardId}`);
    }

    // Upload to Appwrite Storage
    console.log(`[uploadImageToStorage] Creating file in storage for card ${cardId}`);
    const file = await storage.createFile(BUCKET_ID, cardId, blob);
    console.log(`[uploadImageToStorage] File created successfully: ${file.$id}`);
    return file.$id;
  } catch (error) {
    console.warn(`[uploadImageToStorage] Failed to upload image for card ${cardId}:`, error);
    // If file already exists due to race condition, return the cardId as fileId
    if ((error as any)?.message?.includes('already exists')) {
      console.log(`[uploadImageToStorage] File already exists, returning cardId as fileId`);
      return cardId;
    }
    return null;
  }
};

export async function pushSnapshotToCloud(snapshot: CloudSnapshot): Promise<void> {
  try {
    console.log('=== PUSH START ===');
    console.log(`Cards to push: ${snapshot.cards.length}, Categories to push: ${snapshot.categories.length}`);
    
    // Get current user ID
    const user = await account.get();
    const userId = user.$id;

    // Fetch existing cloud data to check for name duplicates
    let existingCardNames = new Set<string>();
    let existingCategoryNames = new Set<string>();
    
    try {
      const existingCards = await databases.listDocuments(DATABASE_ID, COLLECTION_IDS.cards);
      const existingCategories = await databases.listDocuments(DATABASE_ID, COLLECTION_IDS.categories);
      
      existingCards.documents
        .filter((doc) => doc.userId === userId)
        .forEach((doc) => existingCardNames.add(String(doc.word || '').toLowerCase()));
      
      existingCategories.documents
        .filter((doc) => doc.userId === userId)
        .forEach((doc) => existingCategoryNames.add(String(doc.name || '').toLowerCase()));
      
      console.log(`Existing cloud cards: ${existingCardNames.size}, categories: ${existingCategoryNames.size}`);
    } catch (error) {
      console.warn('Could not fetch existing cloud data for deduplication:', error);
      // Continue anyway - deduplication is a safeguard, not blocking
    }

    let pushedCardCount = 0;
    // Push cards to database
    for (const card of snapshot.cards) {
      console.log(`Processing card: "${card.word}" (id: ${card.id}), imageUrl: ${card.imageUrl?.substring(0, 50)}...`);
      try {
        // Skip if card with same name already exists in cloud
        if (existingCardNames.has(card.word.toLowerCase())) {
          console.log(`Skipping card push: "${card.word}" already exists in cloud`);
          continue;
        }

        // Handle imageUrl and imageFileId
        let imageFileId: string | null = null;
        let imageUrl = 'image'; // Default placeholder
        
        console.log(`Attempting image upload for card "${card.word}", has data URL: ${card.imageUrl?.startsWith('data:') ?? false}`);
        // Try to upload data URL to storage
        if (card.imageUrl && card.imageUrl.startsWith('data:')) {
          imageFileId = await uploadImageToStorage(card.id, card.imageUrl);
          console.log(`Image upload result for "${card.word}": fileId=${imageFileId}`);
        }
        
        // Set imageUrl: use original if it's not a data URL and fits, else use placeholder
        if (card.imageUrl && !card.imageUrl.startsWith('data:') && card.imageUrl.length < 200000) {
          imageUrl = card.imageUrl;
          console.log(`Using stored image URL for "${card.word}"`);
        } else if (imageFileId) {
          imageUrl = getImageUrlFromStorage(imageFileId, APPWRITE_PROJECT_ID, APPWRITE_ENDPOINT);
          console.log(`Using storage preview URL for "${card.word}"`);
        } else {
          console.log(`Using placeholder imageUrl for "${card.word}"`);
        }
        // else: keep default 'image' placeholder
        
        console.log(`Creating/updating card document for "${card.word}"`);
        await createOrUpdateDocument(
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
        pushedCardCount++;
        console.log(`Successfully pushed card: "${card.word}" (total: ${pushedCardCount})`);
      } catch (error) {
        console.error(`Failed to sync card ${card.id}:`, error);
      }
    }
    
    console.log(`=== PUSH COMPLETE: ${pushedCardCount} cards pushed ===`);

    // Push categories to database
    for (const category of snapshot.categories) {
      try {
        // Skip if category with same name already exists in cloud
        if (existingCategoryNames.has(category.name.toLowerCase())) {
          console.log(`Skipping category push: "${category.name}" already exists in cloud`);
          continue;
        }
        await createOrUpdateDocument(
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
      } catch (error) {
        console.error(`Failed to sync category ${category.id}:`, error);
      }
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

    // Create sets of existing local IDs for quick deduplication lookup
    // This prevents pulling cards/categories that already exist locally
    const localCardIds = new Set(localCards.map((card) => card.id));
    const localCategoryIds = new Set(localCategories.map((cat) => cat.id));
    
    // Also create name-based sets to prevent pulling duplicates by name
    // Normalize: trim whitespace and lowercase to catch variations
    const localCardNames = new Set(
      localCards.map((card) => card.word.trim().toLowerCase())
    );
    const localCategoryNames = new Set(
      localCategories.map((cat) => cat.name.trim().toLowerCase())
    );

    console.log('[PULL] Local categories:', Array.from(localCategoryNames));
    console.log('[PULL] Local cards:', Array.from(localCardNames).slice(0, 10));

    // Try to pull from database first
    const cardsResponse = await databases.listDocuments(DATABASE_ID, COLLECTION_IDS.cards);
    const categoriesResponse = await databases.listDocuments(DATABASE_ID, COLLECTION_IDS.categories);

    // Filter to only cards and categories not available locally (by ID or name)
    const cards = normalizeCards(
      cardsResponse.documents
        .filter((doc) => {
          const hasId = localCardIds.has(doc.$id);
          // Normalize cloud word: trim and lowercase before comparing
          const cloudCardWord = String(doc.word || '').trim().toLowerCase();
          const hasName = localCardNames.has(cloudCardWord);
          const isUserCard = doc.userId === userId;
          
          if (isUserCard && !hasId && hasName) {
            console.log(`[PULL] Skipping card "${doc.word}" - already exists locally`);
          }
          
          return isUserCard && !hasId && !hasName;
        })
        .map((doc) => ({
          id: doc.$id,
          ...doc,
        })),
      APPWRITE_PROJECT_ID,
      APPWRITE_ENDPOINT
    );

    const categories = normalizeCategories(
      categoriesResponse.documents
        .filter((doc) => {
          const hasId = localCategoryIds.has(doc.$id);
          // Normalize cloud name: trim and lowercase before comparing
          const cloudCatName = String(doc.name || '').trim().toLowerCase();
          const hasName = localCategoryNames.has(cloudCatName);
          const isUserCategory = doc.userId === userId;
          
          if (isUserCategory && !hasId && hasName) {
            console.log(`[PULL] Skipping category "${doc.name}" - already exists locally`);
          }
          
          return isUserCategory && !hasId && !hasName;
        })
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
