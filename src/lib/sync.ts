import {
  account,
  databases,
  storage,
  DATABASE_ID,
  COLLECTION_IDS,
  BUCKET_ID,
  APPWRITE_ENDPOINT,
  APPWRITE_PROJECT_ID,
} from '@/lib/appwrite';

import { Permission, Role } from 'appwrite';
import type { Flashcard, Category, AppSettings } from '@/types/flashcard';

export type BlobCache = Map<string, Blob>;

export interface CloudSnapshot {
  version: 1;
  updatedAt: number;
  cards: Flashcard[];
  categories: Category[];
  settings: AppSettings;
}

/* -------------------- HELPERS -------------------- */

const createOrUpdateDocument = async (
  collectionId: string,
  docId: string,
  data: any
) => {
  try {
    await databases.updateDocument(DATABASE_ID, collectionId, docId, data);
  } catch (err: any) {
    if (err?.code === 404) {
      await databases.createDocument(DATABASE_ID, collectionId, docId, data);
    } else {
      throw err;
    }
  }
};

const getImageUrl = (fileId: string) => {
  return `${APPWRITE_ENDPOINT}/storage/buckets/${BUCKET_ID}/files/${fileId}/preview?project=${APPWRITE_PROJECT_ID}&width=200&height=200`;
};

const compressImage = async (blob: Blob, maxSize = 500000): Promise<Blob> => {
  if (blob.size <= maxSize) return blob;

  return new Promise((resolve) => {
    const img = new Image();
    img.src = URL.createObjectURL(blob);

    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d')!;
      let scale = 1;

      const tryCompress = () => {
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;

        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        canvas.toBlob((b) => {
          if (!b) return resolve(blob);

          if (b.size <= maxSize || scale < 0.4) {
            resolve(b);
          } else {
            scale -= 0.1;
            tryCompress();
          }
        }, 'image/jpeg', 0.7);
      };

      tryCompress();
    };
  });
};

const uploadImage = async (
  cardId: string,
  blobCache?: BlobCache,
  userId?: string
) => {
  const blob = blobCache?.get(cardId);
  if (!blob) return null;

  const compressed = await compressImage(blob);

  try {
    await storage.deleteFile(BUCKET_ID, cardId);
  } catch {}

  const file = new File([compressed], `${cardId}.jpg`, {
    type: 'image/jpeg',
  });

  const res = await storage.createFile(
    BUCKET_ID,
    cardId,
    file,
    [
      Permission.read(Role.any()), // 🔥 IMPORTANT
      Permission.update(Role.user(userId!)),
      Permission.delete(Role.user(userId!)),
    ]
  );

  return res.$id;
};

/* -------------------- PUSH -------------------- */

export async function pushSnapshotToCloud(
  snapshot: CloudSnapshot,
  blobCache?: BlobCache,
  deletedIds: string[] = []
) {
  console.log('=== PUSH START ===');

  const user = await account.get();
  const userId = user.$id;

  /* ---------- CARDS ---------- */
  for (const card of snapshot.cards) {
    try {
      let imageFileId = card.imageFileId;

      if (!imageFileId && blobCache?.has(card.id)) {
        console.log('Uploading image for:', card.word);
        imageFileId = await uploadImage(card.id, blobCache, userId);
      }

      const imageUrl = imageFileId
        ? getImageUrl(imageFileId)
        : 'image';

      await createOrUpdateDocument(
        COLLECTION_IDS.cards,
        card.id,
        {
          userId,
          word: card.word,
          categoryId: card.categoryId,
          imageFileId,
          imageUrl,
          createdAt: card.createdAt,
          updatedAt: Date.now(),
        }
      );

      console.log('Synced card:', card.word);
    } catch (e) {
      console.error('Card sync failed:', card.id, e);
    }
  }

  /* ---------- DELETE CARDS ---------- */
  for (const id of deletedIds) {
    try {
      await databases.deleteDocument(
        DATABASE_ID,
        COLLECTION_IDS.cards,
        id
      );
      console.log('Deleted from cloud:', id);
    } catch (e) {
      console.warn('Delete failed:', id);
    }
  }

  /* ---------- CATEGORIES ---------- */
  for (const cat of snapshot.categories) {
    try {
      await createOrUpdateDocument(
        COLLECTION_IDS.categories,
        cat.id,
        {
          userId,
          name: cat.name,
          icon: cat.icon,
          color: cat.color,
          order: cat.order,
          createdAt: cat.createdAt,
          updatedAt: Date.now(),
        }
      );
    } catch (e) {
      console.error('Category sync failed:', cat.id);
    }
  }

  console.log('=== PUSH COMPLETE ===');
}

/* -------------------- PULL -------------------- */

export async function pullSnapshotFromCloud(): Promise<CloudSnapshot> {
  const user = await account.get();
  const userId = user.$id;

  const cardsRes = await databases.listDocuments(
    DATABASE_ID,
    COLLECTION_IDS.cards
  );

  const catsRes = await databases.listDocuments(
    DATABASE_ID,
    COLLECTION_IDS.categories
  );

  const cards = cardsRes.documents
    .filter((d) => d.userId === userId)
    .map((d) => ({
      id: d.$id,
      word: d.word,
      categoryId: d.categoryId,
      imageFileId: d.imageFileId,
      imageUrl: d.imageFileId ? getImageUrl(d.imageFileId) : '',
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
      syncStatus: 'synced' as const,
    }));

  const categories = catsRes.documents
    .filter((d) => d.userId === userId)
    .map((d) => ({
      id: d.$id,
      name: d.name,
      icon: d.icon,
      color: d.color,
      order: d.order,
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
      syncStatus: 'synced' as const,
    }));

  return {
    version: 1,
    updatedAt: Date.now(),
    cards,
    categories,
    settings: {
      autoPlayAudio: true,
      voiceSpeed: 'normal',
      repeatAudio: false,
      theme: 'sunshine',
      enableCloudSync: true,
    },
  };
}
