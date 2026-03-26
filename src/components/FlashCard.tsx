import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useMotionValue, useSpring, useTransform } from 'framer-motion';
import { Volume2 } from 'lucide-react';
import type { Flashcard } from '@/types/flashcard';
import { useHaptics } from '@/hooks/useHaptics';

interface FlashCardProps {
  card: Flashcard;
  onSpeak: () => void;
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  isFirst?: boolean;
  isLast?: boolean;
}

export function FlashCard({ card, onSpeak, onSwipeLeft, onSwipeRight, isFirst = false, isLast = false }: FlashCardProps) {
  const SWIPE_OFFSET_THRESHOLD = 85;
  const SWIPE_VELOCITY_THRESHOLD = 520;
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-220, 0, 220], [-10, 0, 10]);
  const rawScale = useTransform(x, [-220, 0, 220], [0.96, 1, 0.96]);
  const scale = useSpring(rawScale, { stiffness: 350, damping: 28, mass: 0.45 });
  const hapticStartedRef = useRef(false);
  const thresholdCrossedRef = useRef(false);
  const hasDraggedRef = useRef(false);
  const haloTimerRef = useRef<number | null>(null);
  const [isHaloVisible, setIsHaloVisible] = useState(false);
  const [haloPulseKey, setHaloPulseKey] = useState(0);
  const { triggerHaptic } = useHaptics();

  // Generate a gradient background based on card properties
  const gradients = [
    'from-purple-400 via-pink-400 to-blue-400',
    'from-pink-300 via-yellow-300 to-orange-300',
    'from-blue-400 via-cyan-400 to-teal-400',
    'from-green-400 via-emerald-400 to-teal-400',
    'from-orange-400 via-red-400 to-pink-400',
    'from-indigo-400 via-purple-400 to-pink-400',
  ];
  
  // Use card id to pick a consistent gradient
  const gradientIndex = card.id.charCodeAt(0) % gradients.length;
  const bgGradient = gradients[gradientIndex];
  const canSwipeLeft = !isLast;
  const canSwipeRight = !isFirst;

  const dragConstraints =
    isFirst && !isLast
      ? { left: -280, right: 0 }
      : isLast && !isFirst
        ? { left: 0, right: 280 }
        : undefined;

  const triggerHaloPulse = () => {
    if (haloTimerRef.current !== null) {
      window.clearTimeout(haloTimerRef.current);
      haloTimerRef.current = null;
    }

    setHaloPulseKey((prev) => prev + 1);
    setIsHaloVisible(true);
    haloTimerRef.current = window.setTimeout(() => {
      setIsHaloVisible(false);
      haloTimerRef.current = null;
    }, 900);
  };

  useEffect(() => {
    return () => {
      if (haloTimerRef.current !== null) {
        window.clearTimeout(haloTimerRef.current);
      }
    };
  }, []);

  return (
    <motion.div
      className="flashcard-shell relative w-full max-w-md mx-auto aspect-[3/4] cursor-pointer select-none"
      style={{ x, rotate, scale, touchAction: 'pan-y' }}
      onClick={() => {
        if (hasDraggedRef.current) {
          hasDraggedRef.current = false;
          return;
        }
        triggerHaptic(10);
        triggerHaloPulse();
        onSpeak();
      }}
      whileTap={{ scale: 0.97 }}
      whileDrag={{ scale: 1.015 }}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ type: 'spring', stiffness: 320, damping: 30, mass: 0.55 }}
      drag={isFirst && isLast ? false : 'x'}
      dragConstraints={dragConstraints}
      dragElastic={0.24}
      dragMomentum
      dragTransition={{
        power: 0.18,
        timeConstant: 180,
        bounceStiffness: 620,
        bounceDamping: 34,
        restDelta: 0.5,
      }}
      onDragStart={() => {
        hapticStartedRef.current = true;
        thresholdCrossedRef.current = false;
        hasDraggedRef.current = false;
        triggerHaptic(8);
      }}
      onDrag={(event, info) => {
        const offsetX = info.offset.x;
        if (Math.abs(offsetX) > 10) {
          hasDraggedRef.current = true;
        }

        const crossed = Math.abs(offsetX) > SWIPE_OFFSET_THRESHOLD;

        if (crossed && !thresholdCrossedRef.current) {
          thresholdCrossedRef.current = true;
          triggerHaptic(14);
        }

        if (!crossed && thresholdCrossedRef.current) {
          thresholdCrossedRef.current = false;
        }

        if ((isFirst && offsetX > SWIPE_OFFSET_THRESHOLD) || (isLast && offsetX < -SWIPE_OFFSET_THRESHOLD)) {
          if (hapticStartedRef.current) {
            hapticStartedRef.current = false;
            triggerHaptic(10);
          }
        }
      }}
      onDragEnd={(event, info) => {
        const offsetX = info.offset.x;
        const velocityX = info.velocity.x;
        const swipedRight = offsetX > SWIPE_OFFSET_THRESHOLD || velocityX > SWIPE_VELOCITY_THRESHOLD;
        const swipedLeft = offsetX < -SWIPE_OFFSET_THRESHOLD || velocityX < -SWIPE_VELOCITY_THRESHOLD;

        hapticStartedRef.current = false;
        thresholdCrossedRef.current = false;

        if (swipedRight && canSwipeRight) {
          triggerHaptic([30, 10, 20]); // Success feedback pattern
          onSwipeRight?.();
        } else if (swipedLeft && canSwipeLeft) {
          triggerHaptic([30, 10, 20]); // Success feedback pattern
          onSwipeLeft?.();
        } else {
          triggerHaptic(6);
        }
      }}
    >
      {isHaloVisible && (
        <motion.div
          key={haloPulseKey}
          className="pointer-events-none absolute -inset-3 rounded-[2rem] border-4"
          style={{
            borderColor: 'hsl(var(--primary) / 0.75)',
            boxShadow: '0 0 0.9rem hsl(var(--primary) / 0.45), 0 0 2.2rem hsl(var(--primary) / 0.28)',
          }}
          initial={{ opacity: 0.95, scale: 0.92 }}
          animate={{ opacity: 0, scale: 1.08 }}
          transition={{ duration: 0.85, ease: 'easeOut' }}
        />
      )}

      {isHaloVisible && (
        <motion.div
          key={`inner-${haloPulseKey}`}
          className="pointer-events-none absolute -inset-1 rounded-[2rem] border-2"
          style={{
            borderColor: 'hsl(var(--accent) / 0.65)',
            boxShadow: '0 0 0.6rem hsl(var(--accent) / 0.38)',
          }}
          initial={{ opacity: 0.75, scale: 0.98 }}
          animate={{ opacity: 0, scale: 1.03 }}
          transition={{ duration: 0.75, ease: 'easeOut' }}
        />
      )}

      <div className="flashcard-content relative h-full w-full bg-card rounded-3xl card-shadow overflow-hidden flex flex-col">
        {/* Image Section */}
        <div className={`flashcard-image flex-1 relative overflow-hidden bg-gradient-to-br ${bgGradient} flex items-center justify-center`}>
          <img
            src={card.imageUrl}
            alt={card.word}
            className="w-full h-full object-contain"
            loading="eager"
          />
          
          {/* Sound indicator */}
          <motion.div
            className="absolute top-4 right-4 w-14 h-14 bg-card/90 backdrop-blur-sm rounded-full flex items-center justify-center shadow-lg"
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
          >
            <Volume2 className="w-7 h-7 text-accent" />
          </motion.div>
        </div>

        {/* Word Section */}
        <div className="flashcard-word py-8 px-6 bg-gradient-to-t from-primary/20 to-transparent">
          <h2 className="text-4xl md:text-5xl font-extrabold text-center text-foreground break-words">
            {card.word}
          </h2>
        </div>
      </div>

      {/* Tap hint */}
      <p className="text-center mt-4 text-muted-foreground font-semibold text-lg">
        👆 Tap to hear!
      </p>
    </motion.div>
  );
}
