import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Lock, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ParentGateProps {
  onSuccess: () => void;
  onCancel: () => void;
}

export function ParentGate({ onSuccess, onCancel }: ParentGateProps) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);
  const correctPin = '1234';

  const handleDigit = (digit: string) => {
    if (pin.length < 4) {
      const newPin = pin + digit;
      setPin(newPin);
      setError(false);

      if (newPin.length === 4) {
        if (newPin === correctPin) {
          onSuccess();
        } else {
          setError(true);
          setTimeout(() => {
            setPin('');
            setError(false);
          }, 500);
        }
      }
    }
  };

  const handleClear = () => {
    setPin('');
    setError(false);
  };

  return (
    <motion.div
      className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex items-center justify-center p-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        className="bg-card rounded-3xl p-8 max-w-sm w-full card-shadow"
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.9, y: 20 }}
      >
        <button
          onClick={onCancel}
          className="absolute top-4 right-4 w-10 h-10 rounded-full bg-muted flex items-center justify-center"
        >
          <X className="w-5 h-5 text-muted-foreground" />
        </button>

        <div className="flex items-center justify-center mb-6">
          <div className="w-16 h-16 bg-primary/20 rounded-full flex items-center justify-center">
            <Lock className="w-8 h-8 text-primary-foreground" />
          </div>
        </div>

        <h2 className="text-2xl font-bold text-center mb-2">Parent Area</h2>
        <p className="text-muted-foreground text-center mb-6">Enter PIN: 1234</p>

        {/* PIN Display */}
        <div className="flex justify-center gap-3 mb-6">
          {[0, 1, 2, 3].map((i) => (
            <motion.div
              key={i}
              className={`w-12 h-12 rounded-xl border-2 flex items-center justify-center ${
                error
                  ? 'border-destructive bg-destructive/10'
                  : pin.length > i
                  ? 'border-primary bg-primary/20'
                  : 'border-border bg-muted'
              }`}
              animate={error ? { x: [0, -5, 5, -5, 5, 0] } : {}}
              transition={{ duration: 0.3 }}
            >
              {pin.length > i && (
                <div className="w-4 h-4 rounded-full bg-primary" />
              )}
            </motion.div>
          ))}
        </div>

        {/* Number Pad */}
        <div className="grid grid-cols-3 gap-3">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'clear'].map(
            (digit, index) => (
              <div key={index}>
                {digit === '' ? (
                  <div />
                ) : digit === 'clear' ? (
                  <Button
                    variant="outline"
                    className="w-full h-14 text-lg font-semibold rounded-xl"
                    onClick={handleClear}
                  >
                    Clear
                  </Button>
                ) : (
                  <motion.button
                    className="w-full h-14 bg-muted hover:bg-muted/80 rounded-xl text-2xl font-bold transition-colors"
                    onClick={() => handleDigit(digit)}
                    whileTap={{ scale: 0.95 }}
                  >
                    {digit}
                  </motion.button>
                )}
              </div>
            )
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
