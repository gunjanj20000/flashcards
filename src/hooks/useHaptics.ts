import { useCallback, useRef } from 'react';

type HapticPattern = number | number[];

export function useHaptics() {
  const audioContextRef = useRef<AudioContext | null>(null);

  const getAudioContext = useCallback(() => {
    if (typeof window === 'undefined') return null;

    const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return null;

    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContextClass();
    }

    return audioContextRef.current;
  }, []);

  const playTactileClick = useCallback((intensity: 'light' | 'medium' | 'strong' = 'light') => {
    const context = getAudioContext();
    if (!context) return;

    if (context.state === 'suspended') {
      context.resume().catch(() => undefined);
    }

    const now = context.currentTime;
    const oscillator = context.createOscillator();
    const gainNode = context.createGain();

    const settings = {
      light: { freq: 90, gain: 0.018, duration: 0.035 },
      medium: { freq: 100, gain: 0.024, duration: 0.045 },
      strong: { freq: 120, gain: 0.03, duration: 0.06 },
    }[intensity];

    oscillator.type = 'triangle';
    oscillator.frequency.setValueAtTime(settings.freq, now);

    gainNode.gain.setValueAtTime(0.0001, now);
    gainNode.gain.exponentialRampToValueAtTime(settings.gain, now + 0.008);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, now + settings.duration);

    oscillator.connect(gainNode);
    gainNode.connect(context.destination);

    oscillator.start(now);
    oscillator.stop(now + settings.duration + 0.01);
  }, [getAudioContext]);

  const triggerHaptic = useCallback((pattern: HapticPattern = 10) => {
    try {
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        const didVibrate = navigator.vibrate(pattern);
        if (didVibrate) return;
      }
    } catch {
      // Fall through to click fallback
    }

    const duration = Array.isArray(pattern)
      ? Math.max(...pattern)
      : pattern;

    if (duration >= 24) {
      playTactileClick('strong');
      return;
    }

    if (duration >= 14) {
      playTactileClick('medium');
      return;
    }

    playTactileClick('light');
  }, [playTactileClick]);

  return { triggerHaptic };
}
