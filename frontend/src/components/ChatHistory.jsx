import React from 'react';

/**
 * ChatHistory renders the scrollable list of bubbles.
 * If the history is empty, it renders a clean greeting screen with suggestion prompt cards.
 */
export default function ChatHistory({ messages, isProcessing, bottomRef, onSelectSuggestion, userName }) {
  // If no conversation messages yet and we are not processing, show welcome state.
  if (messages.length === 0 && !isProcessing) {
    const hours = new Date().getHours();
    let timeGreeting = "Good afternoon";
    if (hours < 12) {
      timeGreeting = "Good morning";
    } else if (hours >= 17) {
      timeGreeting = "Good evening";
    }

    return (
      <div className="welcome-container">
        <h2 className="welcome-title">Hello {userName || 'Sophia'},</h2>
        <p className="welcome-text">
          {timeGreeting} — What can I help you build or refine today?
        </p>

        {/* Suggestion prompt cards */}
        <div className="suggestions-grid">
          <div 
            className="suggestion-card" 
            onClick={() => onSelectSuggestion("Summarize my attached document")}
          >
            <div className="suggestion-title">Summarize document</div>
            <div className="suggestion-desc">Get a quick audio summary of your text file</div>
          </div>
          <div 
            className="suggestion-card" 
            onClick={() => onSelectSuggestion("Let's practice a speech or conversation")}
          >
            <div className="suggestion-title">Voice practice</div>
            <div className="suggestion-desc">Let's have a brief conversational chat</div>
          </div>
          <div 
            className="suggestion-card" 
            onClick={() => onSelectSuggestion("What are the key takeaways from my uploaded file?")}
          >
            <div className="suggestion-title">Key takeaways</div>
            <div className="suggestion-desc">Extract core details from your document</div>
          </div>
          <div 
            className="suggestion-card" 
            onClick={() => onSelectSuggestion("Explain this topic concisely")}
          >
            <div className="suggestion-title">Concise review</div>
            <div className="suggestion-desc">Get brief voice answers on any topic</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="conversation-container">
      {messages.map((msg, index) => (
        <div key={index} className={`chat-bubble ${msg.role}`}>
          <div className="bubble-meta">
            {msg.role === 'user' ? 'You' : 'Voice Assistant'} {msg.timestamp && `• ${msg.timestamp}`}
          </div>
          <div className="bubble-content">
            {msg.content}
          </div>
        </div>
      ))}
      
      {isProcessing && (
        <div className="chat-bubble assistant processing">
          <div className="bubble-meta">Voice Assistant • Thinking...</div>
          <div className="bubble-content thinking-indicator">
            <span></span>
            <span></span>
            <span></span>
          </div>
        </div>
      )}

      {/* Invisible anchor element to scroll into view */}
      <div ref={bottomRef} />
    </div>
  );
}
