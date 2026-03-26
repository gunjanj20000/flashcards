/**
 * Appwrite Schema Setup Script
 * 
 * This sets up the complete database and storage schema for the flashcard app.
 * Since Appwrite SDK v23 doesn't expose database management, use the CLI or console.
 * 
 * For now, this displays setup instructions and opens the Appwrite console.
 */

export const DATABASE_ID = 'kidscard_db';
export const CARDS_COLLECTION_ID = 'cards';
export const CATEGORIES_COLLECTION_ID = 'categories';
export const SETTINGS_COLLECTION_ID = 'settings';
export const BUCKET_ID = 'card_images';

const SCHEMA_SETUP_GUIDE = `
===========================================
   APPWRITE SCHEMA SETUP INSTRUCTIONS
===========================================

The Appwrite SDK doesn't expose database management API.
Please use ONE of these methods:

METHOD 1: Appwrite CLI (Recommended)
=====================================
1. Install Appwrite CLI: npm install -g appwrite
2. Run: appwrite login
3. Create schema file "appwrite.json" in your project
4. Copy this config:

{
  "projectId": "69c4cb210004f8c67249",
  "databases": [
    {
      "databaseId": "kidscard_db",
      "name": "kidscard-db",
      "collections": [
        {
          "collectionId": "categories",
          "name": "categories",
          "attributes": [
            { "key": "userId", "type": "string", "size": 36, "required": true },
            { "key": "name", "type": "string", "size": 120, "required": true },
            { "key": "icon", "type": "string", "size": 16, "required": true },
            { "key": "color", "type": "string", "size": 24, "required": true },
            { "key": "order", "type": "integer", "required": true },
            { "key": "createdAt", "type": "integer", "required": true },
            { "key": "updatedAt", "type": "integer", "required": true },
            { "key": "syncStatus", "type": "string", "size": 16, "required": false }
          ]
        },
        {
          "collectionId": "cards",
          "name": "cards",
          "attributes": [
            { "key": "userId", "type": "string", "size": 36, "required": true },
            { "key": "word", "type": "string", "size": 120, "required": true },
            { "key": "imageUrl", "type": "string", "size": 200000, "required": true },
            { "key": "categoryId", "type": "string", "size": 36, "required": true },
            { "key": "createdAt", "type": "integer", "required": true },
            { "key": "updatedAt", "type": "integer", "required": true },
            { "key": "syncStatus", "type": "string", "size": 16, "required": false },
            { "key": "imageFileId", "type": "string", "size": 64, "required": false }
          ]
        },
        {
          "collectionId": "settings",
          "name": "settings",
          "attributes": [
            { "key": "userId", "type": "string", "size": 36, "required": true },
            { "key": "autoPlayAudio", "type": "boolean", "required": true },
            { "key": "voiceSpeed", "type": "string", "size": 16, "required": true },
            { "key": "repeatAudio", "type": "boolean", "required": true },
            { "key": "theme", "type": "string", "size": 24, "required": true },
            { "key": "enableCloudSync", "type": "boolean", "required": true },
            { "key": "updatedAt", "type": "integer", "required": true }
          ]
        }
      ]
    }
  ],
  "buckets": [
    {
      "bucketId": "card_images",
      "name": "card-images",
      "maxFileSize": 5242880,
      "allowedFileExtensions": ["jpg", "jpeg", "png", "webp", "gif"],
      "encryption": true,
      "antivirus": false
    }
  ]
}

5. Run: appwrite deploy


METHOD 2: Appwrite Console (Manual)
===================================
1. Visit: https://sgp.cloud.appwrite.io/console/projects/69c4cb210004f8c67249/databases
2. Create Database: "kidscard-db" (ID: kidscard_db)
3. For each collection below, create:

Collections:
- categories (ID: categories)
- cards (ID: cards)
- settings (ID: settings)

4. For each collection, add these attributes:
   
   CATEGORIES:
   - userId (string, 36 chars, required)
   - name (string, 120 chars, required)
   - icon (string, 16 chars, required)
   - color (string, 24 chars, required)
   - order (integer, required)
   - createdAt (integer, required)
   - updatedAt (integer, required)
   - syncStatus (string, 16 chars, optional)

   CARDS:
   - userId (string, 36 chars, required)
   - word (string, 120 chars, required)
   - imageUrl (string, 200000 chars, required)
   - categoryId (string, 36 chars, required)
   - createdAt (integer, required)
   - updatedAt (integer, required)
   - syncStatus (string, 16 chars, optional)
   - imageFileId (string, 64 chars, optional)

   SETTINGS:
   - userId (string, 36 chars, required)
   - autoPlayAudio (boolean, required)
   - voiceSpeed (string, 16 chars, required)
   - repeatAudio (boolean, required)
   - theme (string, 24 chars, required)
   - enableCloudSync (boolean, required)
   - updatedAt (integer, required)

5. Create indexes for each collection (see APPWRITE_SCHEMA.md)
6. Create bucket: "card-images" (ID: card_images)
   - Max file size: 5MB
   - Allowed types: jpg, jpeg, png, webp, gif
   - File security: enabled


After setup, the sync feature will use these collections!
`;

export async function setupAppwriteSchema() {
  console.log(SCHEMA_SETUP_GUIDE);
  
  // Open Appwrite console in a new tab
  const consoleUrl = 'https://sgp.cloud.appwrite.io/console/projects/69c4cb210004f8c67249/databases';
  window.open(consoleUrl, '_blank');
  
  return {
    success: true,
    message: 'Setup guide logged. Opening Appwrite Console in new tab.',
  };
}

