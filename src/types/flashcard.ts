export interface Flashcard {
  id: string;
  word: string;
  imageUrl: string;
  imageFileId?: string; // Appwrite Storage file ID
  categoryId: string;
  createdAt?: number;
  updatedAt?: number;
  syncStatus?: 'synced' | 'pending' | 'conflict';
  // Images are now stored as blobs in separate imagesStore
}

export interface Category {
  id: string;
  name: string;
  icon: string;
  color: 'coral' | 'mint' | 'sky' | 'lavender' | 'sunshine' | 'peach';
  order?: number;
  createdAt?: number;
  updatedAt?: number;
  syncStatus?: 'synced' | 'pending' | 'conflict';
}

export interface AppSettings {
  autoPlayAudio: boolean;
  voiceSpeed: 'slow' | 'normal';
  repeatAudio: boolean;
  theme: 'sunshine' | 'ocean' | 'berry';
  enableCloudSync?: boolean;
}

export interface SyncState {
  lastSyncedAt: number | null;
  isSyncing: boolean;
  isOnline: boolean;
  pendingChanges: number;
}
