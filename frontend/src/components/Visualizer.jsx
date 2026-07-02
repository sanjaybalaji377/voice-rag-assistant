import React from 'react';

/**
 * Animated visualizer that bounces during voice capture or speech playback.
 */
export default function Visualizer({ isListening, isSpeaking }) {
  // If the agent is idle, display an empty spacing block to keep the UI layout stable.
  if (!isListening && !isSpeaking) {
    return <div style={{ height: '24px' }} />;
  }

  // Cyan bars for recording/listening, emerald green bars for synthesis playback
  const barColor = isListening ? 'var(--color-accent)' : '#10b981';
  const barClass = isListening ? 'vis-bar listening-bar' : 'vis-bar speaking-bar';

  return (
    <div className="visualizer-container" aria-hidden="true">
      <div className={barClass} style={{ backgroundColor: barColor }} />
      <div className={barClass} style={{ backgroundColor: barColor, animationDelay: '0.15s' }} />
      <div className={barClass} style={{ backgroundColor: barColor, animationDelay: '0.3s' }} />
      <div className={barClass} style={{ backgroundColor: barColor, animationDelay: '0.45s' }} />
      <div className={barClass} style={{ backgroundColor: barColor, animationDelay: '0.6s' }} />
    </div>
  );
}
