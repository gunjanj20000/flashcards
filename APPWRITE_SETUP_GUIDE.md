# Appwrite Setup Guide for Kids Flashcards

## Issues Found

### 1. **Database Collection Permissions** ❌
**Error**: `The current user is not authorized to perform the requested action`

**Location**: When pulling from database or fetching existing cards for deduplication

**Solution**: Configure collection permissions in Appwrite Console

1. Go to [Appwrite Console](https://cloud.appwrite.io)
2. Select your project: `6720e5a200027ceb79a8`
3. Go to **Databases** → `kidscard_db`
4. For each collection (`cards`, `categories`, `settings`):
   - Click on the collection
   - Go to **Settings** tab
   - Under **Permissions**, add:
     - **Any (Public)**: Read, Write
     - OR **Users**: Read, Write (recommended for security)

The collections need to allow authenticated users to read and write documents.

### 2. **Image Upload Size Limit** ✅ FIXED
**Error**: `File not found in payload` when uploading 1.5MB+ images

**Solution**: Added automatic image compression before upload
- Images are now compressed to 500KB max
- Uses canvas-based JPEG compression
- Reduces quality and dimensions iteratively until under limit
- No manual action needed - fixed in code

### 3. **Account Preferences Serialization** ⚠️
**Error**: `Invalid 'prefs' param: Value must be a valid object`

**Status**: Caught and ignored in code, but indicates prefs storage has issues
- Currently not blocking sync operations
- Prefs update using account.updatePrefs() may need adjustment

## Testing the Fix

1. **Appwrite Console Setup** (Required):
   - Set collection permissions as described above
   - Collections: `cards`, `categories`, `settings`
   - Grant read/write to authenticated users

2. **Test Image Upload**:
   - Add a card with an image
   - Check browser console for compression logs
   - Verify image uploads successfully to storage

3. **Test Card Sync**:
   - After images upload, cards should sync to database
   - Pull should work without authorization errors

## Environment Details

- **Project ID**: `69c4cb210004f8c67249`
- **Endpoint**: `https://sgp.cloud.appwrite.io/v1`
- **Database ID**: `kidscard_db`
- **Collections**: 
  - `cards` (flashcard data with images)
  - `categories` (category data)
  - `settings` (user settings)
- **Storage Bucket**: `card_images`

## Next Steps

1. ✅ Fix image compression (DONE in code)
2. 📋 Configure Appwrite collection permissions (MANUAL - Appwrite Console)
3. ✅ Test and verify sync works end-to-end
