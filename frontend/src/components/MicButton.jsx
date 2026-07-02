import React from 'react';

/**
 * Animated Microphone Button that visually indicates agent states.
 */
export default function MicButton({ isListening, isProcessing, isSpeaking, onClick }) {
  
  // Decide button classes and icon based on state
  let buttonClass = '';
  let statusText = 'Click to Talk';
  let icon = null;

  if (isListening) {
    buttonClass = 'listening';
    statusText = 'Listening...';
    icon = (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="32" height="32">
        <rect x="6" y="6" width="12" height="12" rx="2" />
      </svg>
    );
  } else if (isProcessing) {
    buttonClass = 'processing';
    statusText = 'Processing...';
    icon = (
      <svg 
        xmlns="http://www.w3.org/2000/svg" 
        viewBox="0 0 24 24" 
        fill="none" 
        stroke="currentColor" 
        strokeWidth="3" 
        width="32" 
        height="32" 
        style={{ animation: 'spin 1.2s linear infinite' }}
      >
        <circle cx="12" cy="12" r="9" stroke="rgba(255,255,255,0.2)" />
        <path d="M12 3a9 9 0 0 1 9 9" strokeLinecap="round" />
        <style>{`
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}</style>
      </svg>
    );
  } else if (isSpeaking) {
    buttonClass = 'speaking';
    statusText = 'Speaking...';
    icon = (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="32" height="32">
        <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
      </svg>
    );
  } else {
    icon = (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="32" height="32">
        <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
        <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
      </svg>
    );
  }

  return (
    <div className="mic-button-container">
      {/* Background glowing rings that trigger on status */}
      {isListening && (
        <>
          <div className="pulse-ring listening-ring-1"></div>
          <div className="pulse-ring listening-ring-2"></div>
        </>
      )}
      {isSpeaking && (
        <div className="pulse-ring speaking-ring"></div>
      )}

      {/* Main button */}
      <button 
        type="button"
        className={`mic-button ${buttonClass}`} 
        onClick={onClick} 
        aria-label={statusText}
        disabled={isProcessing}
      >
        {icon}
      </button>
    </div>
  );
}
