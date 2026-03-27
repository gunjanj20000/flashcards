import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Settings, Loader2, Palette } from 'lucide-react';
import { CategoryCard } from '@/components/CategoryCard';
import { CardViewer } from '@/components/CardViewer';
import { SettingsPage } from '@/components/SettingsPage';
import { useFlashcards } from '@/hooks/useFlashcards';
import type { Category } from '@/types/flashcard';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { DndContext, DragEndEvent, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

type View = 'home' | 'viewer' | 'settings';

const THEME_OPTIONS = [
  { id: 'sunshine' as const, name: 'Sunshine', icon: '🌞' },
  { id: 'ocean' as const, name: 'Ocean Pop', icon: '🌊' },
  { id: 'berry' as const, name: 'Berry Blast', icon: '🫐' },
];

interface SortableCategoryItemProps {
  category: Category;
  cardCount: number;
  index: number;
  isReorderMode: boolean;
  onSelect: () => void;
  onPressStart: () => void;
  onPressEnd: () => void;
}

function SortableCategoryItem({
  category,
  cardCount,
  index,
  isReorderMode,
  onSelect,
  onPressStart,
  onPressEnd,
}: SortableCategoryItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: category.id,
    disabled: !isReorderMode,
  });

  return (
    <motion.div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.02, 0.2) }}
      className={`${isReorderMode ? 'icon-jiggle' : ''} ${isDragging ? 'z-20 scale-105' : ''}`}
      onPointerDown={onPressStart}
      onPointerUp={onPressEnd}
      onPointerCancel={onPressEnd}
      onPointerLeave={onPressEnd}
      {...(isReorderMode ? { ...attributes, ...listeners } : {})}
    >
      <CategoryCard
        category={category}
        cardCount={cardCount}
        onClick={() => {
          if (!isReorderMode) {
            onSelect();
          }
        }}
      />
    </motion.div>
  );
}

const Index = () => {
  const {
    categories,
    cards,
    settings,
    isLoading,
    getCardsByCategory,
    addCard,
    updateCard,
    deleteCard,
    addCategory,
    updateCategory,
    reorderCategories,
    deleteCategory,
    updateSettings,
    createLocalBackup,
    restoreLocalBackup,
    refreshFromStorage,
    syncState,
    isPushSyncing,
    isPullSyncing,
    syncToCloud,
    pullFromCloud,
  } = useFlashcards();

  const [view, setView] = useState<View>('home');
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [isReorderMode, setIsReorderMode] = useState(false);
  const longPressTimerRef = useRef<number | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 4,
      },
    })
  );

  const sortedCategories = useMemo(
    () =>
      [...categories].sort((a, b) => {
        const aOrder = a.order ?? Number.MAX_SAFE_INTEGER;
        const bOrder = b.order ?? Number.MAX_SAFE_INTEGER;
        if (aOrder !== bOrder) return aOrder - bOrder;
        return (a.createdAt ?? 0) - (b.createdAt ?? 0);
      }),
    [categories]
  );

  const cardCountByCategory = useMemo(() => {
    const counts = new Map<string, number>();

    for (const card of cards) {
      counts.set(card.categoryId, (counts.get(card.categoryId) ?? 0) + 1);
    }

    return counts;
  }, [cards]);

  const handleCategorySelect = (category: Category) => {
    setSelectedCategory(category);
    setView('viewer');
  };

  const handleCategoryChange = (category: Category) => {
    setSelectedCategory(category);
  };

  const handleSettingsClick = () => {
    setView('settings');
  };

  const handleBack = () => {
    setView('home');
    setSelectedCategory(null);
    setIsReorderMode(false);
  };

  const clearLongPressTimer = () => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const startLongPress = () => {
    if (isReorderMode) return;
    clearLongPressTimer();
    longPressTimerRef.current = window.setTimeout(() => {
      setIsReorderMode(true);
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate([18, 10, 18]);
      }
    }, 3000);
  };

  const endLongPress = () => {
    clearLongPressTimer();
  };

  const handleCategoryDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = sortedCategories.findIndex((category) => category.id === active.id);
    const newIndex = sortedCategories.findIndex((category) => category.id === over.id);

    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(sortedCategories, oldIndex, newIndex);
    reorderCategories(reordered.map((item) => item.id));
  };

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', settings.theme);
  }, [settings.theme]);

  if (isLoading) {
    return (
      <div className="h-[100dvh] bg-background flex items-center justify-center overflow-hidden">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center gap-4"
        >
          <Loader2 className="w-12 h-12 text-primary animate-spin" />
          <p className="text-lg font-semibold text-muted-foreground">Loading flashcards...</p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="h-[100dvh] bg-background font-nunito overflow-hidden">
      <AnimatePresence mode="wait">
        {view === 'home' && (
          <motion.div
            key="home"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="h-[100dvh] p-3 pb-4 flex flex-col overflow-hidden"
          >
            {/* App Bar */}
            <header className="mb-4 rounded-3xl bg-gradient-to-r from-primary/25 via-secondary/20 to-accent/20 backdrop-blur-sm card-shadow px-3 py-3 border border-primary/20">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <h1 className="text-xl sm:text-2xl font-extrabold text-foreground leading-tight truncate">
                    🎴 Flash Cards
                  </h1>
                  {isReorderMode && (
                    <p className="text-muted-foreground font-semibold mt-0.5 text-sm sm:text-base truncate">
                      Drag icons to move them. Tap Done when finished.
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-1 shrink-0">
                {isReorderMode && (
                  <Button
                    variant="outline"
                    className="h-11 rounded-2xl font-bold"
                    onClick={() => setIsReorderMode(false)}
                  >
                    Done
                  </Button>
                )}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <motion.button
                      className="w-12 h-12 bg-card rounded-2xl card-shadow flex items-center justify-center"
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      title="Select theme"
                    >
                      <Palette className="w-6 h-6 text-primary" />
                    </motion.button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48 rounded-2xl p-2">
                    {THEME_OPTIONS.map((theme) => (
                      <DropdownMenuItem
                        key={theme.id}
                        onClick={() => updateSettings({ theme: theme.id })}
                        className={`flex items-center gap-3 px-3 py-2 rounded-xl cursor-pointer ${
                          settings.theme === theme.id ? 'bg-primary/20' : 'hover:bg-muted'
                        }`}
                      >
                        <span className="text-lg">{theme.icon}</span>
                        <span className="font-semibold">{theme.name}</span>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
                <motion.button
                  onClick={handleSettingsClick}
                  className="w-12 h-12 bg-card rounded-2xl card-shadow flex items-center justify-center"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  <Settings className="w-6 h-6 text-muted-foreground" />
                </motion.button>
              </div>
              </div>
            </header>

            {/* Category Grid */}
            <DndContext sensors={sensors} onDragEnd={handleCategoryDragEnd}>
              <SortableContext
                items={sortedCategories.map((category) => category.id)}
                strategy={rectSortingStrategy}
              >
                <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-2 flex-1 min-h-0 auto-rows-fr overflow-hidden">
                  {sortedCategories.map((category, index) => (
                    <SortableCategoryItem
                      key={category.id}
                      category={category}
                      cardCount={cardCountByCategory.get(category.id) ?? 0}
                      index={index}
                      isReorderMode={isReorderMode}
                      onSelect={() => handleCategorySelect(category)}
                      onPressStart={startLongPress}
                      onPressEnd={endLongPress}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          </motion.div>
        )}

        {view === 'viewer' && selectedCategory && (
          <motion.div
            key="viewer"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
          >
            <CardViewer
              category={selectedCategory}
              cards={getCardsByCategory(selectedCategory.id)}
              settings={settings}
              onBack={handleBack}
              onAddCard={addCard}
              allCategories={sortedCategories}
              onCategoryChange={handleCategoryChange}
            />
          </motion.div>
        )}

        {view === 'settings' && (
          <motion.div
            key="settings"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
          >
            <SettingsPage
              categories={categories}
              cards={cards}
              settings={settings}
              onUpdateSettings={updateSettings}
              onAddCard={addCard}
              onUpdateCard={updateCard}
              onDeleteCard={deleteCard}
              onAddCategory={addCategory}
              onUpdateCategory={updateCategory}
              onDeleteCategory={deleteCategory}
              onCreateLocalBackup={createLocalBackup}
              onRestoreLocalBackup={restoreLocalBackup}
              syncState={syncState}
              isPushSyncing={isPushSyncing}
              isPullSyncing={isPullSyncing}
              onSyncToCloud={syncToCloud}
              onPullFromCloud={pullFromCloud}
              onRefreshFromStorage={refreshFromStorage}
              onBack={handleBack}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Index;
