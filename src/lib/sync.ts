import { account } from '@/lib/appwrite';
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

const normalizeCards = (raw: unknown): Flashcard[] => {
  if (!Array.isArray(raw)) return [];

  return raw
    .filter((item): item is Record<string, unknown> => isRecord(item))
    .map((item) => ({
      id: String(item.id ?? ''),
      word: String(item.word ?? ''),
      imageUrl: String(item.imageUrl ?? ''),
      categoryId: String(item.categoryId ?? ''),
      createdAt: typeof item.createdAt === 'number' ? item.createdAt : Date.now(),
      updatedAt: typeof item.updatedAt === 'number' ? item.updatedAt : Date.now(),
      syncStatus: 'synced' as const,
    }))
    .filter((card) => card.id && card.word && card.imageUrl && card.categoryId);
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

export async function pushSnapshotToCloud(snapshot: CloudSnapshot): Promise<void> {
  const prefs = (await account.getPrefs()) as Record<string, unknown>;

  await account.updatePrefs({
    ...prefs,
    [CLOUD_PREFS_KEY]: snapshot,
  });
}

export async function pullSnapshotFromCloud(): Promise<CloudSnapshot | null> {
  const prefs = (await account.getPrefs()) as Record<string, unknown>;
  return parseSnapshot(prefs[CLOUD_PREFS_KEY]);
}
