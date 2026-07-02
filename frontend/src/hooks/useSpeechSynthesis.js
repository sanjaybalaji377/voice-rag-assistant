import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * Custom React hook wrapping the browser SpeechSynthesis API for Text-to-Speech.
 */
export default function useSpeechSynthesis() {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [error, setError] = useState(null);
  const [isSupported, setIsSupported] = useState(true);
  const utteranceRef = useRef(null);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.speechSynthesis) {
      setIsSupported(false);
      setError("Speech synthesis is not supported in this browser.");
    }
  }, []);

  /**
   * Speak a text string using the browser text-to-speech.
   * @param {string} text - The text to read.
   * @param {Function} [onEndCallback] - Function to trigger when speaking finishes.
   */
  const speak = useCallback((text, onEndCallback) => {
    if (!isSupported || !window.speechSynthesis) return;

    // Immediately stop any currently ongoing speech synthesis
    window.speechSynthesis.cancel();

    if (!text || text.trim() === '') return;

    const utterance = new SpeechSynthesisUtterance(text);
    utteranceRef.current = utterance;

    // Set voice options
    const voices = window.speechSynthesis.getVoices();
    
    // Choose a natural English voice if available (e.g. Google US English, Samantha, etc.)
    const preferredVoice = voices.find(v => 
      v.lang.startsWith('en') && (v.name.includes('Google') || v.name.includes('Natural'))
    ) || voices.find(v => v.lang.startsWith('en'));

    if (preferredVoice) {
      utterance.voice = preferredVoice;
    }

    utterance.rate = 1.0;  // Standard speed
    utterance.pitch = 1.0; // Standard pitch

    utterance.onstart = () => {
      setIsSpeaking(true);
      setError(null);
    };

    utterance.onend = () => {
      setIsSpeaking(false);
      if (onEndCallback) onEndCallback();
    };

    utterance.onerror = (event) => {
      // 'interrupted' error is normal when we click the button to record again and stop speech.
      if (event.error !== 'interrupted') {
        console.error("SpeechSynthesis error:", event);
        setError(`Speech playback error: ${event.error}`);
      }
      setIsSpeaking(false);
    };

    window.speechSynthesis.speak(utterance);
  }, [isSupported]);

  /**
   * Interrupt and stop speech playback.
   */
  const cancel = useCallback(() => {
    if (!isSupported || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
  }, [isSupported]);

  return {
    isSpeaking,
    error,
    isSupported,
    speak,
    cancel
  };
}
