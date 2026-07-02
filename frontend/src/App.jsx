import React from 'react';
import VoiceAgent from './components/VoiceAgent.jsx';

/**
 * Main Application Shell. Sets up background glow animations and mounts the Voice Agent.
 */
export default function App() {
  return (
    <>
      {/* Decorative ambient glowing lights in background */}
      <div className="ambient-glow-1" aria-hidden="true" />
      <div className="ambient-glow-2" aria-hidden="true" />
      
      {/* Core Orchestration Component handles layout dashboard */}
      <VoiceAgent />
    </>
  );
}
