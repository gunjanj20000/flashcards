import { useCallback, useRef } from 'react';

interface UseSpeechOptions {
  speed?: 'slow' | 'normal';
}

export function useSpeech(options: UseSpeechOptions = {}) {
  const { speed = 'normal' } = options;
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  const speak = useCallback((text: string) => {
    if (!('speechSynthesis' in window)) {
      console.warn('Speech synthesis not supported');
      return;
    }

    // Cancel any ongoing speech
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = speed === 'slow' ? 0.7 : 0.9;
    utterance.pitch = 1.1; // Slightly higher pitch for child-friendly voice
    utterance.volume = 1;

    // Try to find a friendly voice
    const voices = window.speechSynthesis.getVoices();
    const preferredVoice = voices.find(
      (v) => v.name.includes('Samantha') || v.name.includes('Karen') || v.lang.startsWith('en')
    );
    if (preferredVoice) {
      utterance.voice = preferredVoice;
    }

    utteranceRef.current = utterance;
    window.speechSynthesis.speak(utterance);
  }, [speed]);

  const stop = useCallback(() => {
    window.speechSynthesis.cancel();
  }, []);

  return { speak, stop };
}
