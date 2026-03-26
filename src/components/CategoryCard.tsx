import { motion } from 'framer-motion';
import type { Category } from '@/types/flashcard';
import { cn } from '@/lib/utils';

interface CategoryCardProps {
  category: Category;
  cardCount: number;
  onClick: () => void;
}

const colorClasses: Record<Category['color'], string> = {
  coral: 'bg-coral',
  mint: 'bg-mint',
  sky: 'bg-sky',
  lavender: 'bg-lavender',
  sunshine: 'bg-sunshine',
  peach: 'bg-peach',
};

export function CategoryCard({ category, cardCount, onClick }: CategoryCardProps) {
  return (
    <motion.button
      onClick={onClick}
      className={cn(
        'relative flex flex-col items-center justify-center',
        'w-full aspect-square rounded-3xl',
        'touch-target card-shadow',
        'transition-all duration-200',
        colorClasses[category.color]
      )}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.96 }}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
    >
      <span className="text-4xl md:text-5xl mb-2">{category.icon}</span>
      <span className="text-sm md:text-lg font-bold text-foreground/90 text-center leading-tight">
        {category.name}
      </span>
      <span className="text-xs md:text-sm font-semibold text-foreground/60 mt-0.5">
        {cardCount} {cardCount === 1 ? 'card' : 'cards'}
      </span>
    </motion.button>
  );
}
