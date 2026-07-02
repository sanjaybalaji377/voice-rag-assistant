import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * Custom React hook wrapping the browser Web Speech API for Speech-to-Text.
 */
export default function useSpeechRecognition() {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState(null);
  const [isSupported, setIsSupported] = useState(true);
  const recognitionRef = useRef(null);

  useEffect(() => {
    // Check if the browser supports Speech Recognition
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setIsSupported(false);
      setError("Speech recognition is not supported in this browser. Please use Google Chrome, MS Edge, or Safari.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false; // Stop listening automatically once the user finishes speaking
    recognition.interimResults = true; // Enable interim results for live transcription
    recognition.lang = 'en-US';

    recognition.onstart = () => {
      setIsListening(true);
      setError(null);
      setTranscript('');
    };

    recognition.onresult = (event) => {
      // Accumulate all transcript segments (interim and final)
      let combinedTranscript = '';
      for (let i = 0; i < event.results.length; i++) {
        combinedTranscript += event.results[i][0].transcript;
      }
      setTranscript(combinedTranscript);
    };

    recognition.onerror = (event) => {
      console.error("Web Speech API recognition error:", event.error);
      setIsListening(false);
      
      switch (event.error) {
        case 'not-allowed':
        case 'permission-denied':
          setError("Microphone permission denied. Please click the site padlock icon to allow microphone access.");
          break;
        case 'no-speech':
          setError("No speech detected. Please speak clearly after clicking the microphone.");
          break;
        case 'network':
          setError("Network error. Please check your internet connection.");
          break;
        case 'aborted':
          // Speech recognition aborted manually, no action needed
          break;
        default:
          setError(`Speech capture error: ${event.error}`);
      }
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;
  }, []);

  const startListening = useCallback(() => {
    if (!isSupported) return;
    
    // Stop any active instance before restarting to prevent exceptions
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch (e) {
        // Safe to ignore
      }
      
      try {
        recognitionRef.current.start();
      } catch (err) {
        console.error("Failed to start speech recognition:", err);
        setError("Could not start microphone input. Please try again.");
      }
    }
  }, [isSupported]);

  const stopListening = useCallback(() => {
    if (!isSupported || !recognitionRef.current) return;
    try {
      recognitionRef.current.stop();
    } catch (err) {
      console.error("Failed to stop speech recognition:", err);
    }
  }, [isSupported]);

  const clearError = useCallback(() => setError(null), []);

  return {
    isListening,
    transcript,
    error,
    isSupported,
    startListening,
    stopListening,
    clearError,
    setTranscript
  };
}
