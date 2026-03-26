import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, ChevronLeft, ChevronRight, ChevronDown, Plus, Check, X, Upload } from 'lucide-react';
import { FlashCard } from '@/components/FlashCard';
import { useSpeech } from '@/hooks/useSpeech';
import { useHaptics } from '@/hooks/useHaptics';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import type { Flashcard, Category, AppSettings } from '@/types/flashcard';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface CardViewerProps {
  category: Category;
  cards: Flashcard[];
  settings: AppSettings;
  onBack: () => void;
  onAddCard?: (card: Omit<Flashcard, 'id'>) => void;
  allCategories?: Category[];
  onCategoryChange?: (category: Category) => void;
}

export function CardViewer({ category, cards, settings, onBack, onAddCard, allCategories = [], onCategoryChange }: CardViewerProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const { speak } = useSpeech({ speed: settings.voiceSpeed });
  const [isAddingCard, setIsAddingCard] = useState(false);
  const [newCardWord, setNewCardWord] = useState('');
  const [newCardImage, setNewCardImage] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { triggerHaptic } = useHaptics();

  const currentCard = cards[currentIndex];

  const speakWord = useCallback(() => {
    if (currentCard) {
      speak(currentCard.word);
    }
  }, [currentCard, speak]);

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

  const handleAddCard = () => {
    if (newCardWord.trim() && newCardImage.trim() && onAddCard) {
      triggerHaptic([20, 10, 20]);
      onAddCard({
        word: newCardWord.trim(),
        imageUrl: newCardImage.trim(),
        categoryId: category.id,
      });
      setNewCardWord('');
      setNewCardImage('');
      setIsAddingCard(false);
      toast.success('Card added successfully!');
    }
  };

  // Auto-play on card change
  useEffect(() => {
    if (!settings.autoPlayAudio || !currentCard) {
      return;
    }

    const initialTimer = window.setTimeout(() => {
      speak(currentCard.word);
    }, 300);

    if (!settings.repeatAudio) {
      return () => {
        window.clearTimeout(initialTimer);
      };
    }

    const repeatTimer = window.setInterval(() => {
      speak(currentCard.word);
    }, 3000);

    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(repeatTimer);
    };
  }, [currentCard, settings.autoPlayAudio, settings.repeatAudio, speak]);

  const goNext = () => {
    if (currentIndex < cards.length - 1) {
      triggerHaptic(20);
      setCurrentIndex(currentIndex + 1);
    }
  };

  const goPrev = () => {
    if (currentIndex > 0) {
      triggerHaptic(20);
      setCurrentIndex(currentIndex - 1);
    }
  };

  if (cards.length === 0 && !isAddingCard) {
    return (
      <div className="h-[100dvh] bg-background flex flex-col items-center justify-center p-6 overflow-hidden">
        <div className="text-center">
          <span className="text-6xl mb-4 block">{category.icon}</span>
          <h2 className="text-2xl font-bold mb-2">No Cards Yet!</h2>
          <p className="text-muted-foreground mb-8">Add some cards to get started.</p>
          <div className="flex flex-col gap-4">
            {onAddCard && (
              <motion.button
                onClick={() => setIsAddingCard(true)}
                className="bg-primary text-primary-foreground px-8 py-4 rounded-2xl font-bold text-lg flex items-center justify-center gap-2"
                whileTap={{ scale: 0.95 }}
              >
                <Plus className="w-6 h-6" />
                Add Card Here
              </motion.button>
            )}
            <motion.button
              onClick={onBack}
              className="bg-card text-foreground px-8 py-4 rounded-2xl font-bold text-lg"
              whileTap={{ scale: 0.95 }}
            >
              Go Back
            </motion.button>
          </div>
        </div>
      </div>
    );
  }

  if (isAddingCard) {
    return (
      <div className="h-[100dvh] bg-background flex flex-col p-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <motion.button
            onClick={() => setIsAddingCard(false)}
            className="w-14 h-14 bg-card rounded-2xl card-shadow flex items-center justify-center"
            whileTap={{ scale: 0.95 }}
          >
            <ArrowLeft className="w-7 h-7" />
          </motion.button>
          <h2 className="text-2xl font-bold flex-1">Add New Card</h2>
        </div>

        {/* Add Card Form */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex-1 space-y-4 flex flex-col min-h-0"
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
            <Button
              onClick={handleAddCard}
              className="h-12 px-4 bg-secondary text-secondary-foreground rounded-xl font-semibold"
              disabled={!newCardWord.trim() || !newCardImage.trim()}
            >
              <Check className="w-5 h-5 mr-2" />
              Save
            </Button>
          </div>

          {newCardImage && (
            <div className="relative w-32 h-32 rounded-xl overflow-hidden bg-gradient-to-br from-purple-400 via-pink-400 to-blue-400 mx-auto flex items-center justify-center">
              <img src={newCardImage} alt="Preview" className="w-full h-full object-contain" />
            </div>
          )}

          <div className="flex-1" />

          <div className="flex justify-end">
            <Button
              variant="outline"
              onClick={() => setIsAddingCard(false)}
              className="h-12 px-6 rounded-xl"
            >
              <X className="w-5 h-5" />
            </Button>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="h-[100dvh] bg-background flex flex-col p-4 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <motion.button
          onClick={onBack}
          className="w-14 h-14 bg-card rounded-2xl card-shadow flex items-center justify-center"
          whileTap={{ scale: 0.95 }}
        >
          <ArrowLeft className="w-7 h-7" />
        </motion.button>

        {allCategories.length > 1 && onCategoryChange ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <motion.button
                className="flex items-center gap-2 bg-card px-4 py-3 rounded-2xl card-shadow cursor-pointer hover:bg-muted/50 transition-colors"
                whileTap={{ scale: 0.97 }}
              >
                <span className="text-2xl">{category.icon}</span>
                <span className="font-bold text-lg">{category.name}</span>
                <ChevronDown className="w-5 h-5 text-muted-foreground" />
              </motion.button>
            </DropdownMenuTrigger>
            <DropdownMenuContent 
              align="center" 
              className="w-56 bg-card border-border rounded-2xl p-2 z-50"
            >
              {allCategories.map((cat) => (
                <DropdownMenuItem
                  key={cat.id}
                  onClick={() => onCategoryChange(cat)}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl cursor-pointer transition-colors ${
                    cat.id === category.id 
                      ? 'bg-primary/20 text-foreground' 
                      : 'hover:bg-muted'
                  }`}
                >
                  <span className="text-xl">{cat.icon}</span>
                  <span className="font-semibold">{cat.name}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <div className="flex items-center gap-2 bg-card px-4 py-2 rounded-2xl card-shadow">
            <span className="text-2xl">{category.icon}</span>
            <span className="font-bold text-lg">{category.name}</span>
          </div>
        )}

        {onAddCard && (
          <motion.button
            onClick={() => setIsAddingCard(true)}
            className="w-14 h-14 bg-card rounded-2xl card-shadow flex items-center justify-center hover:bg-muted/50 transition-colors"
            whileTap={{ scale: 0.95 }}
            title="Add new card"
          >
            <Plus className="w-7 h-7 text-primary" />
          </motion.button>
        )}
      </div>

      {/* Progress dots */}
      <div className="flex justify-center gap-2 mb-4">
        {cards.map((_, index) => (
          <button
            key={index}
            onClick={() => setCurrentIndex(index)}
            className={`w-3 h-3 rounded-full transition-all ${
              index === currentIndex ? 'bg-primary w-6' : 'bg-muted'
            }`}
          />
        ))}
      </div>

      {/* Card */}
      <div className="flex-1 min-h-0 flex items-center justify-center">
        <AnimatePresence mode="wait">
          <FlashCard 
            key={currentCard.id} 
            card={currentCard} 
            onSpeak={speakWord}
            onSwipeLeft={goNext}
            onSwipeRight={goPrev}
            isFirst={currentIndex === 0}
            isLast={currentIndex === cards.length - 1}
          />
        </AnimatePresence>
      </div>

      {/* Navigation */}
      <div className="flex justify-center gap-4 mt-3 pb-2">
        <motion.button
          onClick={goPrev}
          disabled={currentIndex === 0}
          className={`w-16 h-16 rounded-full flex items-center justify-center card-shadow transition-all ${
            currentIndex === 0
              ? 'bg-muted text-muted-foreground'
              : 'bg-card text-foreground'
          }`}
          whileTap={{ scale: 0.9 }}
        >
          <ChevronLeft className="w-8 h-8" />
        </motion.button>

        <motion.button
          onClick={goNext}
          disabled={currentIndex === cards.length - 1}
          className={`w-16 h-16 rounded-full flex items-center justify-center card-shadow transition-all ${
            currentIndex === cards.length - 1
              ? 'bg-muted text-muted-foreground'
              : 'bg-card text-foreground'
          }`}
          whileTap={{ scale: 0.9 }}
        >
          <ChevronRight className="w-8 h-8" />
        </motion.button>
      </div>
    </div>
  );
}
