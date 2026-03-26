# Appwrite Database + Storage Schema (For This Project)

This project currently syncs via `account.getPrefs()/updatePrefs()` in `src/lib/sync.ts`.
So Database and Storage are not yet required by the running code.

Use this schema to migrate to Database/Storage sync safely while matching current data models in:
- `src/types/flashcard.ts`
- `src/hooks/useFlashcardSync.ts`
- `src/hooks/useOfflineStorage.ts`

## 1) Database

Create one database:
- Name: `kidscard-db`
- Suggested ID: `kidscard_db`

Create collections:
1. `cards`
2. `categories`
3. `settings`

## 2) Collection: `categories`

Purpose: user-specific flashcard categories.

Suggested attributes:
- `userId` (string, required, size 36)
- `name` (string, required, size 120)
- `icon` (string, required, size 16)
- `color` (string, required, size 24)
- `order` (integer, required)
- `createdAt` (integer, required)
- `updatedAt` (integer, required)
- `syncStatus` (string, optional, size 16)

Suggested indexes:
- `idx_categories_userId` key index on `userId`
- `idx_categories_user_updated` index on (`userId`, `updatedAt`)
- `idx_categories_user_order` index on (`userId`, `order`)

Document ID strategy:
- Use your existing local `category.id` as Appwrite document ID.
- This prevents duplicates across push/pull.

Permissions:
- Per-document permissions:
  - read: `user:{userId}`
  - update: `user:{userId}`
  - delete: `user:{userId}`
- Create permission can be at collection level for authenticated users.

## 3) Collection: `cards`

Purpose: user-specific flashcards.

Suggested attributes:
- `userId` (string, required, size 36)
- `word` (string, required, size 120)
- `imageUrl` (string, required, size 200000)
- `categoryId` (string, required, size 36)
- `createdAt` (integer, required)
- `updatedAt` (integer, required)
- `syncStatus` (string, optional, size 16)
- `imageFileId` (string, optional, size 64)  // for Storage-backed images

Suggested indexes:
- `idx_cards_userId` key index on `userId`
- `idx_cards_user_updated` index on (`userId`, `updatedAt`)
- `idx_cards_user_category` index on (`userId`, `categoryId`)

Document ID strategy:
- Use local `card.id` as Appwrite document ID.

Permissions:
- Per-document permissions:
  - read: `user:{userId}`
  - update: `user:{userId}`
  - delete: `user:{userId}`

## 4) Collection: `settings`

Purpose: one settings document per user.

Suggested attributes:
- `userId` (string, required, size 36)
- `autoPlayAudio` (boolean, required)
- `voiceSpeed` (string, required, size 16)
- `repeatAudio` (boolean, required)
- `theme` (string, required, size 24)
- `enableCloudSync` (boolean, required)
- `updatedAt` (integer, required)

Suggested indexes:
- `idx_settings_userId` unique index on `userId`

Document ID strategy:
- Use `userId` as document ID (one doc per user), or fixed `settings_{userId}`.

Permissions:
- Per-document permissions:
  - read/update/delete: `user:{userId}`

## 5) Storage Bucket

Create one bucket for card images:
- Name: `card-images`
- Suggested ID: `card_images`
- File security: Enabled
- Maximum file size: 5MB (or your preference)
- Allowed extensions: jpg, jpeg, png, webp, gif
- Compression/encryption: optional per your needs

File permissions (recommended):
- read/update/delete: `user:{userId}`

How to connect with cards:
- Upload image to bucket and store returned `fileId` in card `imageFileId`.
- Optionally keep public preview URL in `imageUrl`.

## 6) Deletion Sync (Important)

Your app already tracks local deletions for delta sync.
For database-based multi-device sync, use one of these:

Option A (recommended): soft delete
- Add `deletedAt` (integer, optional) on `cards` and `categories`.
- Delete = set `deletedAt`, do not hard delete immediately.
- Pull ignores older versions and respects latest timestamps.

Option B: tombstone collection
- Create collection `sync_tombstones` with:
  - `userId` string
  - `entityType` string (`card` or `category`)
  - `entityId` string
  - `deletedAt` integer

## 7) Mapping To Current Code

Current live sync:
- `src/lib/sync.ts` uses Appwrite account preferences snapshot.

To migrate to Database/Storage:
1. Replace snapshot read/write in `src/lib/sync.ts` with Databases APIs.
2. Upsert docs using the local IDs as document IDs.
3. Keep current merge strategy from `useFlashcardSync.ts` (latest `updatedAt` wins).
4. Apply deletion strategy (soft delete or tombstones).
5. Keep offline-first IndexedDB behavior as-is.

## 8) IDs You Already Have

From your setup:
- Endpoint: `https://sgp.cloud.appwrite.io/v1`
- Project ID: `69c4cb210004f8c67249`
- Project Name: `kidscard`

Add your final IDs in code constants when you create these resources:
- `DATABASE_ID`
- `CARDS_COLLECTION_ID`
- `CATEGORIES_COLLECTION_ID`
- `SETTINGS_COLLECTION_ID`
- `CARD_IMAGES_BUCKET_ID`
