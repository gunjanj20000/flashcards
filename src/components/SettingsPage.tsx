import { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, Plus, Trash2, Edit3, Check, X, Upload, Download, RotateCcw, Mail, Lock, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { ID } from 'appwrite';
import { account } from '@/lib/appwrite';
import type { Category, Flashcard, AppSettings } from '@/types/flashcard';

interface SettingsPageProps {
  categories: Category[];
  cards: Flashcard[];
  settings: AppSettings;
  onUpdateSettings: (updates: Partial<AppSettings>) => void;
  onAddCard: (card: Omit<Flashcard, 'id'>) => void;
  onUpdateCard: (id: string, updates: Partial<Omit<Flashcard, 'id'>>) => void;
  onDeleteCard: (id: string) => void;
  onAddCategory: (category: Omit<Category, 'id'>) => void;
  onUpdateCategory: (id: string, updates: Partial<Omit<Category, 'id'>>) => void;
  onDeleteCategory: (id: string) => void;
  onCreateLocalBackup: () => Promise<unknown>;
  onRestoreLocalBackup: (backup: unknown) => Promise<{ categories: number; cards: number }>;
  syncState: { lastSyncedAt: number | null; isSyncing: boolean; isOnline: boolean; pendingChanges: number };
  onSyncToCloud: () => Promise<{ success: boolean; error?: string; syncedCards?: number; syncedCategories?: number }>;
  onPullFromCloud: () => Promise<{ success: boolean; error?: string; syncedCards?: number; syncedCategories?: number }>;
  onRefreshFromStorage: () => Promise<void>;
  onBack: () => void;
}

type Tab = 'cards' | 'categories' | 'settings' | 'account';

const colorOptions: Category['color'][] = ['coral', 'mint', 'sky', 'lavender', 'sunshine', 'peach'];
const emojiOptions = ['🐾', '🎨', '🔢', '🍎', '⭐', '🌸', '🎵', '🚗', '🏠', '📚', '🎮', '⚽'];

export function SettingsPage({
  categories,
  cards,
  settings,
  onUpdateSettings,
  onAddCard,
  onUpdateCard,
  onDeleteCard,
  onAddCategory,
  onUpdateCategory,
  onDeleteCategory,
  onCreateLocalBackup,
  onRestoreLocalBackup,
  syncState,
  onSyncToCloud,
  onPullFromCloud,
  onRefreshFromStorage,
  onBack,
}: SettingsPageProps) {
  const [activeTab, setActiveTab] = useState<Tab>('cards');
  const [isAddingCard, setIsAddingCard] = useState(false);
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [editingCardId, setEditingCardId] = useState<string | null>(null);
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);

  // Account tab state
  const [accountMode, setAccountMode] = useState<'login' | 'signup' | 'profile'>('profile');
  const [accountEmail, setAccountEmail] = useState('');
  const [accountPassword, setAccountPassword] = useState('');
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  const [isManualSyncBusy, setIsManualSyncBusy] = useState(false);
  const [isPullConfirmOpen, setIsPullConfirmOpen] = useState(false);
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null);
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [syncLogs, setSyncLogs] = useState<Array<{ timestamp: string; message: string; type: 'info' | 'success' | 'error' }>>([]);

  // New card form state
  const [newCardWord, setNewCardWord] = useState('');
  const [newCardImage, setNewCardImage] = useState('');
  const [newCardCategory, setNewCardCategory] = useState(categories[0]?.id || '');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const editFileInputRef = useRef<HTMLInputElement>(null);
  const restoreFileInputRef = useRef<HTMLInputElement>(null);
  const [isBackupBusy, setIsBackupBusy] = useState(false);

  // Edit card form state
  const [editCardWord, setEditCardWord] = useState('');
  const [editCardImage, setEditCardImage] = useState('');
  const [editCardCategory, setEditCardCategory] = useState('');

  // New category form state
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryIcon, setNewCategoryIcon] = useState(emojiOptions[0]);
  const [newCategoryColor, setNewCategoryColor] = useState<Category['color']>('coral');

  // Edit category form state
  const [editCategoryName, setEditCategoryName] = useState('');
  const [editCategoryIcon, setEditCategoryIcon] = useState('');
  const [editCategoryColor, setEditCategoryColor] = useState<Category['color']>('coral');

  const handleAddCard = () => {
    if (newCardWord.trim() && newCardImage.trim() && newCardCategory) {
      onAddCard({
        word: newCardWord.trim(),
        imageUrl: newCardImage.trim(),
        categoryId: newCardCategory,
      });
      setNewCardWord('');
      setNewCardImage('');
      setIsAddingCard(false);
    }
  };

  const handleStartEditCard = (card: Flashcard) => {
    setEditingCardId(card.id);
    setEditCardWord(card.word);
    setEditCardImage(card.imageUrl);
    setEditCardCategory(card.categoryId);
  };

  const handleSaveEditCard = () => {
    if (editingCardId && editCardWord.trim() && editCardImage.trim()) {
      onUpdateCard(editingCardId, {
        word: editCardWord.trim(),
        imageUrl: editCardImage.trim(),
        categoryId: editCardCategory,
      });
      setEditingCardId(null);
    }
  };

  const handleCancelEditCard = () => {
    setEditingCardId(null);
    setEditCardWord('');
    setEditCardImage('');
    setEditCardCategory('');
  };

  const handleAddCategory = () => {
    if (newCategoryName.trim()) {
      onAddCategory({
        name: newCategoryName.trim(),
        icon: newCategoryIcon,
        color: newCategoryColor,
      });
      setNewCategoryName('');
      setNewCategoryIcon(emojiOptions[0]);
      setNewCategoryColor('coral');
      setIsAddingCategory(false);
    }
  };

  const handleStartEditCategory = (category: Category) => {
    setEditingCategoryId(category.id);
    setEditCategoryName(category.name);
    setEditCategoryIcon(category.icon);
    setEditCategoryColor(category.color);
  };

  const handleSaveEditCategory = () => {
    if (editingCategoryId && editCategoryName.trim()) {
      onUpdateCategory(editingCategoryId, {
        name: editCategoryName.trim(),
        icon: editCategoryIcon,
        color: editCategoryColor,
      });
      setEditingCategoryId(null);
    }
  };

  const handleCancelEditCategory = () => {
    setEditingCategoryId(null);
    setEditCategoryName('');
    setEditCategoryIcon('');
    setEditCategoryColor('coral');
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setNewCardImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleEditImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setEditCardImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleBackup = async () => {
    if (isBackupBusy) return;

    setIsBackupBusy(true);
    try {
      const backupData = await onCreateLocalBackup();
      const backupJson = JSON.stringify(backupData, null, 2);
      const blob = new Blob([backupJson], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `kids-cards-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
      toast.success('Backup saved to this device');
    } catch (error) {
      console.error('Backup failed:', error);
      toast.error('Backup failed');
    } finally {
      setIsBackupBusy(false);
    }
  };

  const handleRestoreFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || isBackupBusy) return;

    setIsBackupBusy(true);
    try {
      const rawText = await file.text();
      const parsed = JSON.parse(rawText);
      const result = await onRestoreLocalBackup(parsed);
      toast.success(`Restored ${result.cards} cards in ${result.categories} categories`);
    } catch (error) {
      console.error('Restore failed:', error);
      toast.error(error instanceof Error ? error.message : 'Restore failed');
    } finally {
      if (restoreFileInputRef.current) {
        restoreFileInputRef.current.value = '';
      }
      setIsBackupBusy(false);
    }
  };

  const getCardCountForCategory = (categoryId: string) =>
    cards.filter((c) => c.categoryId === categoryId).length;

  const parseAuthError = (error: unknown) => {
    if (error && typeof error === 'object' && 'message' in error) {
      const message = (error as { message?: unknown }).message;
      if (typeof message === 'string' && message.trim().length > 0) {
        return message;
      }
    }

    return 'Authentication failed. Please try again.';
  };

  const clearAccountForm = () => {
    setAccountEmail('');
    setAccountPassword('');
  };

  useEffect(() => {
    const checkSession = async () => {
      try {
        const user = await account.get();
        setCurrentUserEmail(user.email);
      } catch {
        setCurrentUserEmail(null);
      } finally {
        setIsCheckingSession(false);
      }
    };

    void checkSession();
  }, []);

  const handleLogin = async () => {
    if (!accountEmail || !accountPassword) return;

    setIsAuthLoading(true);
    try {
      try {
        await account.deleteSession('current');
      } catch {
        // No active session is fine; continue login.
      }

      await account.createEmailPasswordSession(accountEmail.trim(), accountPassword);
      const user = await account.get();
      setCurrentUserEmail(user.email);
      setAccountMode('profile');
      clearAccountForm();
      toast.success('Logged in successfully');
    } catch (error) {
      toast.error(parseAuthError(error));
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handleSignup = async () => {
    if (!accountEmail || !accountPassword || accountPassword.length < 8) return;

    setIsAuthLoading(true);
    const email = accountEmail.trim();
    try {
      try {
        await account.deleteSession('current');
      } catch {
        // No active session is fine; continue signup.
      }

      try {
        await account.create(ID.unique(), email, accountPassword);
      } catch (error) {
        const message = parseAuthError(error);
        if (!/already exists|already registered/i.test(message)) {
          throw error;
        }
      }

      await account.createEmailPasswordSession(email, accountPassword);
      const user = await account.get();
      setCurrentUserEmail(user.email);
      setAccountMode('profile');
      clearAccountForm();
      toast.success('Account ready and logged in');
    } catch (error) {
      toast.error(parseAuthError(error));
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    setIsAuthLoading(true);
    try {
      await account.deleteSession('current');
      setCurrentUserEmail(null);
      setAccountMode('profile');
      clearAccountForm();
      toast.success('Logged out');
    } catch (error) {
      toast.error(parseAuthError(error));
    } finally {
      setIsAuthLoading(false);
    }
  };

  const addSyncLog = (message: string, type: 'info' | 'success' | 'error' = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    setSyncLogs((prev) => [...prev.slice(-9), { timestamp, message, type }]); // Keep last 10 logs
  };

  const handlePushToCloud = async () => {
    setIsManualSyncBusy(true);
    addSyncLog('Starting push to cloud...', 'info');
    try {
      const result = await onSyncToCloud();
      if (!result.success) {
        const errorMsg = result.error ?? 'Push to cloud failed';
        toast.error(errorMsg);
        addSyncLog(errorMsg, 'error');
        return;
      }

      const successMsg = `Pushed ${result.syncedCards ?? 0} cards and ${result.syncedCategories ?? 0} categories`;
      toast.success(successMsg);
      addSyncLog(successMsg, 'success');
    } finally {
      setIsManualSyncBusy(false);
    }
  };

  const handlePullFromCloud = async () => {
    setIsPullConfirmOpen(true);
  };

  const confirmPullFromCloud = async () => {
    setIsPullConfirmOpen(false);
    setIsManualSyncBusy(true);
    addSyncLog('Starting pull from cloud...', 'info');
    try {
      const result = await onPullFromCloud();
      if (!result.success) {
        const errorMsg = result.error ?? 'Pull from cloud failed';
        toast.error(errorMsg);
        addSyncLog(errorMsg, 'error');
        return;
      }

      await onRefreshFromStorage();
      const successMsg = `Pulled ${result.syncedCards ?? 0} cards and ${result.syncedCategories ?? 0} categories`;
      toast.success(successMsg);
      addSyncLog(successMsg, 'success');
    } finally {
      setIsManualSyncBusy(false);
    }
  };



  return (
    <div className="h-[100dvh] bg-background p-4 pb-4 overflow-hidden flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-4 mb-3 shrink-0">
        <motion.button
          onClick={onBack}
          className="w-12 h-12 bg-card rounded-2xl card-shadow flex items-center justify-center"
          whileTap={{ scale: 0.95 }}
        >
          <ArrowLeft className="w-6 h-6" />
        </motion.button>
        <h1 className="text-2xl font-bold">Settings</h1>
      </div>

      <AlertDialog open={isPullConfirmOpen} onOpenChange={setIsPullConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Pull Latest Cloud Changes?</AlertDialogTitle>
            <AlertDialogDescription>
              Cloud and local cards/categories will be merged. If the same item exists in both places,
              the version with the latest updated time will win.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmPullFromCloud}>Continue Pull</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Tabs */}
      <div className="grid grid-cols-4 gap-1 mb-3 bg-muted p-1 rounded-2xl shrink-0 sticky top-0 z-10">
        {(['cards', 'categories', 'settings', 'account'] as Tab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`py-2 px-2 rounded-xl font-semibold text-xs sm:text-sm transition-all whitespace-nowrap ${
              activeTab === tab
                ? 'bg-card card-shadow text-foreground'
                : 'text-muted-foreground'
            }`}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">

      {/* Cards Tab */}
      {activeTab === 'cards' && (
        <div className="h-full flex flex-col gap-3 min-h-0">
          <Button
            onClick={() => setIsAddingCard(true)}
            className="w-full h-12 bg-primary text-primary-foreground rounded-2xl font-semibold text-base"
          >
            <Plus className="w-5 h-5 mr-2" />
            Add New Card
          </Button>

          {isAddingCard && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-card rounded-2xl p-3 card-shadow space-y-3 shrink-0"
            >
              <Input
                placeholder="Word (e.g., Cat)"
                value={newCardWord}
                onChange={(e) => setNewCardWord(e.target.value)}
                className="h-12 rounded-xl text-lg"
              />

              <div className="flex gap-2">
                <Input
                  placeholder="Image URL"
                  value={newCardImage}
                  onChange={(e) => setNewCardImage(e.target.value)}
                  className="h-12 rounded-xl flex-1"
                />
                <input
                  type="file"
                  accept="image/*"
                  ref={fileInputRef}
                  onChange={handleImageUpload}
                  className="hidden"
                />
                <Button
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  className="h-12 px-4 rounded-xl"
                >
                  <Upload className="w-5 h-5" />
                </Button>
              </div>

              {newCardImage && (
                <div className="relative w-24 h-24 rounded-xl overflow-hidden bg-gradient-to-br from-purple-400 via-pink-400 to-blue-400 flex items-center justify-center">
                  <img src={newCardImage} alt="Preview" className="w-full h-full object-contain" />
                </div>
              )}

              <select
                value={newCardCategory}
                onChange={(e) => setNewCardCategory(e.target.value)}
                className="w-full h-12 rounded-xl border border-input bg-card px-4 text-lg"
              >
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.icon} {cat.name}
                  </option>
                ))}
              </select>

              <div className="flex gap-2">
                <Button
                  onClick={handleAddCard}
                  className="flex-1 h-12 bg-secondary text-secondary-foreground rounded-xl font-semibold"
                >
                  <Check className="w-5 h-5 mr-2" />
                  Save
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setIsAddingCard(false)}
                  className="h-12 px-6 rounded-xl"
                >
                  <X className="w-5 h-5" />
                </Button>
              </div>
            </motion.div>
          )}

          {/* Card List */}
          <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-2 gap-2 content-start overflow-y-auto pr-1">
            {cards.map((card) => {
              const category = categories.find((c) => c.id === card.categoryId);
              const isEditing = editingCardId === card.id;

              if (isEditing) {
                return (
                  <motion.div
                    key={card.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="bg-card rounded-2xl p-4 card-shadow space-y-4"
                  >
                    <Input
                      placeholder="Word"
                      value={editCardWord}
                      onChange={(e) => setEditCardWord(e.target.value)}
                      className="h-12 rounded-xl text-lg"
                    />

                    <div className="flex gap-2">
                      <Input
                        placeholder="Image URL"
                        value={editCardImage}
                        onChange={(e) => setEditCardImage(e.target.value)}
                        className="h-12 rounded-xl flex-1"
                      />
                      <input
                        type="file"
                        accept="image/*"
                        ref={editFileInputRef}
                        onChange={handleEditImageUpload}
                        className="hidden"
                      />
                      <Button
                        variant="outline"
                        onClick={() => editFileInputRef.current?.click()}
                        className="h-12 px-4 rounded-xl"
                      >
                        <Upload className="w-5 h-5" />
                      </Button>
                    </div>

                    {editCardImage && (
                      <div className="relative w-24 h-24 rounded-xl overflow-hidden bg-gradient-to-br from-purple-400 via-pink-400 to-blue-400 flex items-center justify-center">
                        <img src={editCardImage} alt="Preview" className="w-full h-full object-contain" />
                      </div>
                    )}

                    <select
                      value={editCardCategory}
                      onChange={(e) => setEditCardCategory(e.target.value)}
                      className="w-full h-12 rounded-xl border border-input bg-card px-4 text-lg"
                    >
                      {categories.map((cat) => (
                        <option key={cat.id} value={cat.id}>
                          {cat.icon} {cat.name}
                        </option>
                      ))}
                    </select>

                    <div className="flex gap-2">
                      <Button
                        onClick={handleSaveEditCard}
                        className="flex-1 h-12 bg-secondary text-secondary-foreground rounded-xl font-semibold"
                      >
                        <Check className="w-5 h-5 mr-2" />
                        Save
                      </Button>
                      <Button
                        variant="outline"
                        onClick={handleCancelEditCard}
                        className="h-12 px-6 rounded-xl"
                      >
                        <X className="w-5 h-5" />
                      </Button>
                    </div>
                  </motion.div>
                );
              }

              return (
                <Card key={card.id} className="p-3 rounded-2xl flex items-center gap-3">
                  <div className="w-16 h-16 rounded-xl overflow-hidden bg-gradient-to-br from-purple-400 via-pink-400 to-blue-400 flex-shrink-0 flex items-center justify-center">
                    <img src={card.imageUrl} alt={card.word} className="w-full h-full object-contain" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-lg truncate">
                      {card.word}{' '}
                      <span className="text-xs font-medium text-muted-foreground normal-case">
                        ({(category?.name ?? 'uncategorized').toLowerCase()})
                      </span>
                    </p>
                  </div>
                  <button
                    onClick={() => handleStartEditCard(card)}
                    className="w-10 h-10 rounded-xl bg-sky/20 flex items-center justify-center"
                  >
                    <Edit3 className="w-5 h-5 text-sky" />
                  </button>
                  <button
                    onClick={() => onDeleteCard(card.id)}
                    className="w-10 h-10 rounded-xl bg-destructive/10 flex items-center justify-center"
                  >
                    <Trash2 className="w-5 h-5 text-destructive" />
                  </button>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Categories Tab */}
      {activeTab === 'categories' && (
        <div className="h-full flex flex-col gap-3 min-h-0">
          <Button
            onClick={() => setIsAddingCategory(true)}
            className="w-full h-12 bg-primary text-primary-foreground rounded-2xl font-semibold text-base"
          >
            <Plus className="w-5 h-5 mr-2" />
            Add New Category
          </Button>

          {isAddingCategory && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-card rounded-2xl p-3 card-shadow space-y-3 shrink-0"
            >
              <Input
                placeholder="Category Name"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                className="h-12 rounded-xl text-lg"
              />

              <div>
                <Label className="text-sm font-semibold mb-2 block">Icon</Label>
                <div className="flex flex-wrap gap-2">
                  {emojiOptions.map((emoji) => (
                    <button
                      key={emoji}
                      onClick={() => setNewCategoryIcon(emoji)}
                      className={`w-12 h-12 rounded-xl text-2xl flex items-center justify-center transition-all ${
                        newCategoryIcon === emoji
                          ? 'bg-primary ring-2 ring-primary ring-offset-2'
                          : 'bg-muted'
                      }`}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <Label className="text-sm font-semibold mb-2 block">Color</Label>
                <div className="flex flex-wrap gap-2">
                  {colorOptions.map((color) => (
                    <button
                      key={color}
                      onClick={() => setNewCategoryColor(color)}
                      className={`w-12 h-12 rounded-xl bg-${color} transition-all ${
                        newCategoryColor === color
                          ? 'ring-2 ring-foreground ring-offset-2'
                          : ''
                      }`}
                    />
                  ))}
                </div>
              </div>

              <div className="flex gap-2">
                <Button
                  onClick={handleAddCategory}
                  className="flex-1 h-12 bg-secondary text-secondary-foreground rounded-xl font-semibold"
                >
                  <Check className="w-5 h-5 mr-2" />
                  Save
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setIsAddingCategory(false)}
                  className="h-12 px-6 rounded-xl"
                >
                  <X className="w-5 h-5" />
                </Button>
              </div>
            </motion.div>
          )}

          {/* Category List */}
          <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-2 gap-2 content-start overflow-y-auto pr-1">
            {categories.map((category) => {
              const isEditing = editingCategoryId === category.id;

              if (isEditing) {
                return (
                  <motion.div
                    key={category.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="bg-card rounded-2xl p-4 card-shadow space-y-4"
                  >
                    <Input
                      placeholder="Category Name"
                      value={editCategoryName}
                      onChange={(e) => setEditCategoryName(e.target.value)}
                      className="h-12 rounded-xl text-lg"
                    />

                    <div>
                      <Label className="text-sm font-semibold mb-2 block">Icon</Label>
                      <div className="flex flex-wrap gap-2">
                        {emojiOptions.map((emoji) => (
                          <button
                            key={emoji}
                            onClick={() => setEditCategoryIcon(emoji)}
                            className={`w-12 h-12 rounded-xl text-2xl flex items-center justify-center transition-all ${
                              editCategoryIcon === emoji
                                ? 'bg-primary ring-2 ring-primary ring-offset-2'
                                : 'bg-muted'
                            }`}
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <Label className="text-sm font-semibold mb-2 block">Color</Label>
                      <div className="flex flex-wrap gap-2">
                        {colorOptions.map((color) => (
                          <button
                            key={color}
                            onClick={() => setEditCategoryColor(color)}
                            className={`w-12 h-12 rounded-xl bg-${color} transition-all ${
                              editCategoryColor === color
                                ? 'ring-2 ring-foreground ring-offset-2'
                                : ''
                            }`}
                          />
                        ))}
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <Button
                        onClick={handleSaveEditCategory}
                        className="flex-1 h-12 bg-secondary text-secondary-foreground rounded-xl font-semibold"
                      >
                        <Check className="w-5 h-5 mr-2" />
                        Save
                      </Button>
                      <Button
                        variant="outline"
                        onClick={handleCancelEditCategory}
                        className="h-12 px-6 rounded-xl"
                      >
                        <X className="w-5 h-5" />
                      </Button>
                    </div>
                  </motion.div>
                );
              }

              return (
                <Card key={category.id} className="p-3 rounded-2xl flex items-center gap-3">
                  <div
                    className={`w-14 h-14 rounded-xl bg-${category.color} flex items-center justify-center text-2xl`}
                  >
                    {category.icon}
                  </div>
                  <div className="flex-1">
                    <p className="font-bold text-lg">{category.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {getCardCountForCategory(category.id)} cards
                    </p>
                  </div>
                  <button
                    onClick={() => handleStartEditCategory(category)}
                    className="w-10 h-10 rounded-xl bg-sky/20 flex items-center justify-center"
                  >
                    <Edit3 className="w-5 h-5 text-sky" />
                  </button>
                  <button
                    onClick={() => onDeleteCategory(category.id)}
                    className="w-10 h-10 rounded-xl bg-destructive/10 flex items-center justify-center"
                  >
                    <Trash2 className="w-5 h-5 text-destructive" />
                  </button>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Settings Tab */}
      {activeTab === 'settings' && (
        <div className="h-full flex flex-col gap-3 min-h-0">
          <Card className="p-4 rounded-2xl">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-bold text-lg">Auto-Play Audio</p>
                <p className="text-sm text-muted-foreground">
                  Speak word when card appears
                </p>
              </div>
              <Switch
                checked={settings.autoPlayAudio}
                onCheckedChange={(checked) => onUpdateSettings({ autoPlayAudio: checked })}
              />
            </div>
          </Card>

          <Card className="p-4 rounded-2xl">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-bold text-lg">Voice Speed</p>
                <p className="text-sm text-muted-foreground">
                  {settings.voiceSpeed === 'slow' ? 'Slower for learning' : 'Normal pace'}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => onUpdateSettings({ voiceSpeed: 'slow' })}
                  className={`px-4 py-2 rounded-xl font-semibold transition-all ${
                    settings.voiceSpeed === 'slow'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground'
                  }`}
                >
                  Slow
                </button>
                <button
                  onClick={() => onUpdateSettings({ voiceSpeed: 'normal' })}
                  className={`px-4 py-2 rounded-xl font-semibold transition-all ${
                    settings.voiceSpeed === 'normal'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground'
                  }`}
                >
                  Normal
                </button>
              </div>
            </div>
          </Card>

          <Card className="p-4 rounded-2xl">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-bold text-lg">Repeat Audio</p>
                <p className="text-sm text-muted-foreground">
                  Repeat current card word every 3 seconds
                </p>
              </div>
              <Switch
                checked={settings.repeatAudio}
                onCheckedChange={(checked) => onUpdateSettings({ repeatAudio: checked })}
              />
            </div>
          </Card>

          <Card className="p-4 rounded-2xl">
            <div className="space-y-3">
              <div>
                <p className="font-bold text-lg">Backup & Restore</p>
                <p className="text-sm text-muted-foreground">
                  Save or restore all cards on this device
                </p>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  onClick={handleBackup}
                  disabled={isBackupBusy}
                  className="h-10 w-10 p-0 rounded-xl"
                  title="Backup to device"
                >
                  <Download className="w-4 h-4" />
                </Button>

                <input
                  type="file"
                  accept="application/json"
                  ref={restoreFileInputRef}
                  onChange={handleRestoreFileSelected}
                  className="hidden"
                />
                <Button
                  variant="outline"
                  onClick={() => restoreFileInputRef.current?.click()}
                  disabled={isBackupBusy}
                  className="h-10 w-10 p-0 rounded-xl"
                  title="Restore from backup"
                >
                  <RotateCcw className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Account Tab */}
      {activeTab === 'account' && (
        <div className="h-full flex flex-col gap-3 min-h-0 overflow-y-auto pr-1">
          {isCheckingSession && (
            <Card className="p-4 rounded-2xl">
              <p className="text-sm text-muted-foreground">Checking account session...</p>
            </Card>
          )}

          {/* Profile Mode */}
          {accountMode === 'profile' && !isCheckingSession && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col gap-3"
            >
              {currentUserEmail ? (
                <>
                  <Card className="p-6 rounded-2xl bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950 dark:to-emerald-950 border-2 border-green-200 dark:border-green-800">
                    <div className="flex flex-col items-center gap-3 text-center">
                      <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center">
                        <User className="w-8 h-8 text-green-700 dark:text-green-300" />
                      </div>
                      <div>
                        <p className="text-lg font-bold">Connected to Appwrite</p>
                        <p className="text-sm text-muted-foreground mt-1">{currentUserEmail}</p>
                      </div>
                    </div>
                  </Card>

                  <Button
                    onClick={handleLogout}
                    disabled={isAuthLoading || isManualSyncBusy || syncState.isSyncing}
                    variant="outline"
                    className="h-12 rounded-2xl font-semibold"
                  >
                    {isAuthLoading ? 'Logging out...' : 'Log Out'}
                  </Button>

                  <Card className="p-4 rounded-2xl space-y-3">
                    <div>
                      <p className="font-bold text-sm">Cloud Sync</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Push sends only pending changes (skips duplicates by name). Pull fetches cards & categories not in app locally by name.
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        onClick={handlePushToCloud}
                        disabled={isManualSyncBusy || syncState.isSyncing}
                        className="h-11 rounded-xl font-semibold"
                      >
                        {isManualSyncBusy || syncState.isSyncing ? 'Syncing...' : 'Push To Cloud'}
                      </Button>
                      <Button
                        onClick={handlePullFromCloud}
                        disabled={isManualSyncBusy || syncState.isSyncing}
                        variant="outline"
                        className="h-11 rounded-xl font-semibold"
                      >
                        {isManualSyncBusy || syncState.isSyncing ? 'Syncing...' : 'Pull From Cloud'}
                      </Button>
                    </div>

                    <div className="text-xs text-muted-foreground space-y-1">
                      <p>Pending local changes: {syncState.pendingChanges}</p>
                      <p>
                        Last sync:{' '}
                        {syncState.lastSyncedAt
                          ? new Date(syncState.lastSyncedAt).toLocaleString()
                          : 'Never'}
                      </p>
                    </div>
                  </Card>

                  <Card className="p-4 rounded-2xl space-y-3">
                    <div>
                      <p className="font-bold text-sm">Sync Activity Log</p>
                    </div>
                    <div className="space-y-2 max-h-48 overflow-y-auto bg-muted rounded-lg p-3">
                      {syncLogs.length === 0 ? (
                        <p className="text-xs text-muted-foreground">No sync activity yet</p>
                      ) : (
                        syncLogs.map((log, idx) => (
                          <div key={idx} className="text-xs">
                            <span className="text-muted-foreground">[{log.timestamp}]</span>{' '}
                            <span
                              className={
                                log.type === 'success'
                                  ? 'text-green-600 dark:text-green-400'
                                  : log.type === 'error'
                                    ? 'text-red-600 dark:text-red-400'
                                    : 'text-blue-600 dark:text-blue-400'
                              }
                            >
                              {log.message}
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  </Card>
                </>
              ) : (
                <>
              {/* Welcome Box */}
              <Card className="p-6 rounded-2xl bg-gradient-to-br from-blue-50 to-purple-50 dark:from-blue-950 dark:to-purple-950 border-2 border-blue-200 dark:border-blue-800">
                <div className="flex flex-col items-center gap-3 text-center">
                  <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center">
                    <User className="w-8 h-8 text-primary" />
                  </div>
                  <div>
                    <p className="text-lg font-bold">Welcome!</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Create an account to sync your flashcards across devices
                    </p>
                  </div>
                </div>
              </Card>

              {/* Login & Signup Buttons */}
              <div className="grid grid-cols-2 gap-2">
                <Button
                  onClick={() => setAccountMode('login')}
                  className="h-14 rounded-2xl font-semibold text-base bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  <Lock className="w-5 h-5 mr-2" />
                  Login
                </Button>
                <Button
                  onClick={() => setAccountMode('signup')}
                  variant="outline"
                  className="h-14 rounded-2xl font-semibold text-base"
                >
                  <User className="w-5 h-5 mr-2" />
                  Sign Up
                </Button>
              </div>

              {/* Features Box */}
              <Card className="p-4 rounded-2xl space-y-3">
                <p className="font-bold text-sm">Account Benefits:</p>
                <div className="space-y-2 text-sm">
                  <div className="flex gap-2">
                    <div className="w-5 h-5 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center flex-shrink-0">
                      <span className="text-green-700 dark:text-green-300 font-bold text-xs">✓</span>
                    </div>
                    <span>Sync flashcards across devices</span>
                  </div>
                  <div className="flex gap-2">
                    <div className="w-5 h-5 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center flex-shrink-0">
                      <span className="text-green-700 dark:text-green-300 font-bold text-xs">✓</span>
                    </div>
                    <span>Cloud backup of your progress</span>
                  </div>
                  <div className="flex gap-2">
                    <div className="w-5 h-5 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center flex-shrink-0">
                      <span className="text-green-700 dark:text-green-300 font-bold text-xs">✓</span>
                    </div>
                    <span>Access from anywhere</span>
                  </div>
                </div>
              </Card>
                </>
              )}
            </motion.div>
          )}

          {/* Login Mode */}
          {accountMode === 'login' && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col gap-3"
            >
              <Card className="p-6 rounded-2xl bg-card border-2 border-blue-200 dark:border-blue-900 space-y-4">
                <div>
                  <p className="text-2xl font-bold">Welcome Back</p>
                  <p className="text-sm text-muted-foreground mt-1">Sign in to your account</p>
                </div>

                <div className="space-y-3">
                  <div>
                    <Label className="text-sm font-semibold mb-2 block">Email</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                      <Input
                        type="email"
                        placeholder="you@example.com"
                        value={accountEmail}
                        onChange={(e) => setAccountEmail(e.target.value)}
                        className="h-12 rounded-xl pl-10 text-base"
                      />
                    </div>
                  </div>

                  <div>
                    <Label className="text-sm font-semibold mb-2 block">Password</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                      <Input
                        type="password"
                        placeholder="Enter your password"
                        value={accountPassword}
                        onChange={(e) => setAccountPassword(e.target.value)}
                        className="h-12 rounded-xl pl-10 text-base"
                      />
                    </div>
                  </div>
                </div>

                <Button
                  onClick={handleLogin}
                  disabled={isAuthLoading || !accountEmail || !accountPassword}
                  className="w-full h-12 rounded-xl font-semibold text-base bg-primary text-primary-foreground"
                >
                  {isAuthLoading ? 'Signing In...' : 'Sign In'}
                </Button>
              </Card>

              <div className="flex items-center justify-center gap-2">
                <div className="h-px flex-1 bg-border" />
                <span className="text-xs text-muted-foreground">or</span>
                <div className="h-px flex-1 bg-border" />
              </div>

              <Button
                onClick={() => {
                  setAccountMode('signup');
                  setAccountEmail('');
                  setAccountPassword('');
                }}
                variant="outline"
                className="h-12 rounded-xl font-semibold"
              >
                Don't have an account? Sign Up
              </Button>

              <button
                onClick={() => {
                  setAccountMode('profile');
                  setAccountEmail('');
                  setAccountPassword('');
                }}
                className="text-sm text-muted-foreground hover:text-foreground text-center py-2"
              >
                Back
              </button>
            </motion.div>
          )}

          {/* Signup Mode */}
          {accountMode === 'signup' && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col gap-3"
            >
              <Card className="p-6 rounded-2xl bg-card border-2 border-green-200 dark:border-green-900 space-y-4">
                <div>
                  <p className="text-2xl font-bold">Create Account</p>
                  <p className="text-sm text-muted-foreground mt-1">Join to sync your progress</p>
                </div>

                <div className="space-y-3">
                  <div>
                    <Label className="text-sm font-semibold mb-2 block">Email</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                      <Input
                        type="email"
                        placeholder="you@example.com"
                        value={accountEmail}
                        onChange={(e) => setAccountEmail(e.target.value)}
                        className="h-12 rounded-xl pl-10 text-base"
                      />
                    </div>
                  </div>

                  <div>
                    <Label className="text-sm font-semibold mb-2 block">Password</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                      <Input
                        type="password"
                        placeholder="Create a password"
                        value={accountPassword}
                        onChange={(e) => setAccountPassword(e.target.value)}
                        className="h-12 rounded-xl pl-10 text-base"
                      />
                    </div>
                  </div>
                </div>

                <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-xl p-3">
                  <p className="text-xs text-muted-foreground">
                    Password must be at least 8 characters long
                  </p>
                </div>

                <Button
                  onClick={handleSignup}
                  disabled={isAuthLoading || !accountEmail || !accountPassword || accountPassword.length < 8}
                  className="w-full h-12 rounded-xl font-semibold text-base bg-green-600 text-white hover:bg-green-700"
                >
                  {isAuthLoading ? 'Creating Account...' : 'Create Account'}
                </Button>
              </Card>

              <Button
                onClick={() => {
                  setAccountMode('login');
                  setAccountEmail('');
                  setAccountPassword('');
                }}
                variant="outline"
                className="h-12 rounded-xl font-semibold"
              >
                Already have an account? Sign In
              </Button>

              <button
                onClick={() => {
                  setAccountMode('profile');
                  setAccountEmail('');
                  setAccountPassword('');
                }}
                className="text-sm text-muted-foreground hover:text-foreground text-center py-2"
              >
                Back
              </button>
            </motion.div>
          )}
        </div>
      )}

      </div>
    </div>
  );
}
