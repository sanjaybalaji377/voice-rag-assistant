import React, { useState, useEffect, useRef } from 'react';
import ChatHistory from './ChatHistory.jsx';
import MicButton from './MicButton.jsx';
import Visualizer from './Visualizer.jsx';
import useSpeechRecognition from '../hooks/useSpeechRecognition.js';
import useSpeechSynthesis from '../hooks/useSpeechSynthesis.js';
import { sendChatMessage } from '../services/api.js';

/**
 * VoiceAgent acts as the Dashboard Orchestrator. It manages:
 * - A list of chat sessions, active chat state, and local storage serialization.
 * - An uploaded documents index supporting standard text files and PDFs (parsed entirely in-browser).
 * - Dynamic profile username editing and persistence.
 * - Voice (STT/TTS) and text chat logic, automatically attaching selected documents as context.
 */
export default function VoiceAgent() {
  // ----------------------------------------------------
  // Initialize States from localStorage (or defaults)
  // ----------------------------------------------------
  const [userName, setUserName] = useState(() => {
    return localStorage.getItem('voice_agent_user_name') || 'Sophia';
  });

  const [chats, setChats] = useState(() => {
    const saved = localStorage.getItem('voice_agent_chats');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error("Failed to parse chats:", e);
      }
    }
    return [{ id: 'default', title: 'Default Chat', messages: [], selectedDocId: null }];
  });

  const [activeChatId, setActiveChatId] = useState(() => {
    return localStorage.getItem('voice_agent_active_chat_id') || 'default';
  });

  const [documents, setDocuments] = useState(() => {
    const saved = localStorage.getItem('voice_agent_documents');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error("Failed to parse documents:", e);
      }
    }
    return [];
  });

  const [textInput, setTextInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [localError, setLocalError] = useState(null);
  
  const bottomRef = useRef(null);
  const fileInputRef = useRef(null); // Ref for hidden input file trigger

  // Derived variables for active chat and messages
  const activeChat = chats.find(c => c.id === activeChatId) || chats[0] || chats[chats.length - 1];
  const messages = activeChat ? activeChat.messages : [];

  // STT hook
  const {
    isListening,
    transcript,
    error: sttError,
    isSupported: isSttSupported,
    startListening,
    stopListening,
    clearError: clearSttError,
    setTranscript
  } = useSpeechRecognition();

  // TTS hook
  const {
    isSpeaking,
    error: ttsError,
    speak,
    cancel: cancelSpeaking
  } = useSpeechSynthesis();

  // ----------------------------------------------------
  // LocalStorage Persistence Effects
  // ----------------------------------------------------
  useEffect(() => {
    localStorage.setItem('voice_agent_user_name', userName);
  }, [userName]);

  useEffect(() => {
    localStorage.setItem('voice_agent_chats', JSON.stringify(chats));
  }, [chats]);

  useEffect(() => {
    localStorage.setItem('voice_agent_active_chat_id', activeChatId);
  }, [activeChatId]);

  useEffect(() => {
    localStorage.setItem('voice_agent_documents', JSON.stringify(documents));
  }, [documents]);

  // Keep chat scrolled to bottom on new messages or loading transitions
  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isProcessing]);

  // Bubble up speech-to-text errors to local UI banner
  useEffect(() => {
    if (sttError) {
      setLocalError(sttError);
    }
  }, [sttError]);

  // Bubble up text-to-speech errors to local UI banner
  useEffect(() => {
    if (ttsError) {
      setLocalError(ttsError);
    }
  }, [ttsError]);

  // Helper to index uploaded files into Python FastAPI Vector Database (ChromaDB)
  const indexDocumentInVectorStore = async (doc) => {
    try {
      const response = await fetch('/api/documents', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          id: doc.id,
          title: doc.name,
          content: doc.content
        })
      });
      if (!response.ok) {
        const errData = await response.json();
        console.error("Vector index API error:", errData.detail || "Unknown error");
      }
    } catch (err) {
      console.error("Failed to index document in vector store:", err);
    }
  };

  // On startup, synchronize all locally saved documents with ChromaDB
  useEffect(() => {
    if (documents.length > 0) {
      documents.forEach(doc => {
        indexDocumentInVectorStore(doc);
      });
    }
  }, []);

  // Sync the live STT transcript to the input box value so the user can see what's being transcribed in real-time
  useEffect(() => {
    if (isListening) {
      setTextInput(transcript);
    }
  }, [transcript, isListening]);

  // Detect when speech recognition finishes and transcribe is populated
  useEffect(() => {
    if (!isListening && transcript.trim() !== '') {
      handleUserUtterance(transcript);
    }
  }, [isListening, transcript]);

  // ----------------------------------------------------
  // Chat Actions
  // ----------------------------------------------------
  const createNewChat = () => {
    cancelSpeaking();
    const newId = Date.now().toString();
    const newChat = {
      id: newId,
      title: `Chat Session`,
      messages: [],
      selectedDocId: null
    };
    setChats(prev => [...prev, newChat]);
    setActiveChatId(newId);
    setLocalError(null);
  };

  const renameChat = (chatId, e) => {
    e.stopPropagation();
    const chatToRename = chats.find(c => c.id === chatId);
    if (!chatToRename) return;
    
    const newTitle = prompt("Enter new chat title:", chatToRename.title);
    if (newTitle && newTitle.trim() !== "") {
      setChats(prev => prev.map(c => c.id === chatId ? { ...c, title: newTitle.trim() } : c));
    }
  };

  const deleteChat = (chatId, e) => {
    e.stopPropagation();
    cancelSpeaking();
    if (chats.length <= 1) {
      // Re-initialize if all are deleted
      setChats([{ id: 'default', title: 'Default Chat', messages: [], selectedDocId: null }]);
      setActiveChatId('default');
      return;
    }

    const index = chats.findIndex(c => c.id === chatId);
    const updatedChats = chats.filter(c => c.id !== chatId);
    setChats(updatedChats);

    if (activeChatId === chatId) {
      const nextActive = updatedChats[Math.max(0, index - 1)];
      setActiveChatId(nextActive.id);
    }
  };

  // ----------------------------------------------------
  // Document Management Actions
  // ----------------------------------------------------
  const handleDocumentUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Enforce 1MB limit for safety in local storage context
    if (file.size > 1024 * 1024) {
      setLocalError("File size exceeds 1MB limit. Please upload a smaller file.");
      return;
    }

    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");

    if (isPdf) {
      // Handle PDF uploads entirely client-side via PDF.js CDN library
      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const arrayBuffer = event.target.result;
          
          const pdfjsLib = window.pdfjsLib;
          if (!pdfjsLib) {
            throw new Error("PDF.js library is not loaded. Please wait a moment and try again.");
          }
          // Point to worker source script hosted on CDN
          pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';
          
          const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
          const pdf = await loadingTask.promise;
          let text = '';
          
          // Loop and extract clean text from each page context
          for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            const pageText = textContent.items.map(item => item.str).join(' ');
            text += pageText + '\n';
          }
          
          if (!text.trim()) {
            throw new Error("The PDF appears to be empty or contains only non-selectable text (scanned images).");
          }

          const newDoc = {
            id: Date.now().toString(),
            name: file.name,
            content: text
          };
          
          setDocuments(prev => [...prev, newDoc]);
          indexDocumentInVectorStore(newDoc);
          
          // Automatically attach the uploaded document to the current active chat
          if (activeChat) {
            setChats(prev => prev.map(c => c.id === activeChat.id ? { ...c, selectedDocId: newDoc.id } : c));
          }
        } catch (err) {
          console.error("PDF extraction failed:", err);
          setLocalError(err.message || "Failed to extract text from PDF file.");
        }
      };
      reader.onerror = () => {
        setLocalError("Failed to read the PDF file buffer.");
      };
      reader.readAsArrayBuffer(file);
    } else {
      // Handle standard text-based files
      const reader = new FileReader();
      reader.onload = (event) => {
        const content = event.target.result;
        const newDoc = {
          id: Date.now().toString(),
          name: file.name,
          content: content
        };
        setDocuments(prev => [...prev, newDoc]);
        indexDocumentInVectorStore(newDoc);
        
        // Automatically attach the uploaded document to the current active chat
        if (activeChat) {
          setChats(prev => prev.map(c => c.id === activeChat.id ? { ...c, selectedDocId: newDoc.id } : c));
        }
      };
      reader.onerror = () => {
        setLocalError("Failed to read the file text content.");
      };
      reader.readAsText(file);
    }
    e.target.value = null; // reset file selector
  };

  const deleteDocument = (docId, e) => {
    e.stopPropagation();
    setDocuments(prev => prev.filter(d => d.id !== docId));
    // Detach from any chats using this document
    setChats(prev => prev.map(c => c.selectedDocId === docId ? { ...c, selectedDocId: null } : c));
  };

  const handleAttachDocument = (docId) => {
    if (!activeChat) return;
    setChats(prev => prev.map(c => c.id === activeChat.id ? { ...c, selectedDocId: docId || null } : c));
  };

  // Trigger click on hidden input file element
  const handlePlusAttachClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  // User Profile edit option
  const handleEditProfile = () => {
    const newName = prompt("Enter your profile name:", userName);
    if (newName !== null) {
      setUserName(newName.trim() || 'Sophia');
    }
  };

  // Asynchronous background chat title generation
  const generateAndSetChatTitle = async (firstMessageText, chatId) => {
    try {
      const titlePrompt = [
        {
          role: 'user',
          content: `Summarize the following user query in a short title of 2 to 4 words. Respond ONLY with the title. Do not include quotes, periods, or extra notes.\n\nText: "${firstMessageText}"`
        }
      ];
      const generatedTitle = await sendChatMessage(titlePrompt);
      // Strip outer quotes and normalize spacing
      const cleanTitle = generatedTitle.replace(/["']/g, '').trim();
      if (cleanTitle) {
        setChats(prev => prev.map(c => c.id === chatId ? { ...c, title: cleanTitle } : c));
      }
    } catch (err) {
      console.error("Failed to generate chat title:", err);
    }
  };

  // ----------------------------------------------------
  // Orchestrated AI Conversation Logic
  // ----------------------------------------------------
  const handleUserUtterance = async (text) => {
    if (!activeChat) return;
    setLocalError(null);
    clearSttError();
    setIsProcessing(true);

    const isFirstMessage = messages.length === 0;

    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const userMessage = { 
      role: 'user', 
      content: text,
      timestamp 
    };
    
    // Add user message to conversation list in state
    const updatedMessages = [...messages, userMessage];
    setChats(prev => prev.map(c => c.id === activeChat.id ? { ...c, messages: updatedMessages } : c));
    
    // Clear transcription states immediately
    setTranscript('');
    setTextInput('');

    const activeDocId = activeChat ? activeChat.selectedDocId : null;
    let payloadMessages = [...updatedMessages];

    try {
      // Send message log context to the backend with active document identifier
      const reply = await sendChatMessage(payloadMessages, activeDocId);
      
      const assistantMessage = { 
        role: 'assistant', 
        content: reply,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      
      setChats(prev => prev.map(c => {
        if (c.id === activeChat.id) {
          return { ...c, messages: [...updatedMessages, assistantMessage] };
        }
        return c;
      }));
      
      // Speak reply if not muted
      if (!isMuted) {
        speak(reply);
      }

      // Generate chat title in the background if this was the first message
      if (isFirstMessage) {
        generateAndSetChatTitle(text, activeChat.id);
      }
    } catch (err) {
      console.error("Failed to fetch reply:", err);
      setLocalError(err.message || "Failed to communicate with LLM server.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleTextSubmit = (e) => {
    e.preventDefault();
    if (textInput.trim() === '') return;
    
    const query = textInput.trim();
    setTextInput('');
    
    // Silence assistant if speaking
    cancelSpeaking();
    
    handleUserUtterance(query);
  };

  const handleMicClick = () => {
    setLocalError(null);

    if (isListening) {
      stopListening();
    } else {
      // Cut off speaking to listen immediately
      cancelSpeaking();
      startListening();
    }
  };

  const handleMuteToggle = () => {
    setIsMuted(prev => {
      const nextMuted = !prev;
      if (nextMuted) {
        cancelSpeaking();
      }
      return nextMuted;
    });
  };

  const dismissError = () => {
    setLocalError(null);
    clearSttError();
  };

  // Find document currently attached to this chat
  const attachedDoc = activeChat ? documents.find(d => d.id === activeChat.selectedDocId) : null;

  return (
    <div className="dashboard-container">
      {/* 1. Left Sidebar: Chat Sessions & Documents */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <h2 className="sidebar-title">Voice AI</h2>
          <button className="new-chat-btn" onClick={createNewChat}>
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
            New Chat
          </button>
        </div>

        {/* Chat History List */}
        <div className="sidebar-section">
          <span className="section-label">Chats</span>
          <div className="items-list">
            {chats.map(c => (
              <div 
                key={c.id} 
                className={`sidebar-item ${c.id === activeChatId ? 'active' : ''}`}
                onClick={() => {
                  cancelSpeaking();
                  setActiveChatId(c.id);
                  setLocalError(null);
                }}
              >
                <span className="item-name">{c.title}</span>
                <div className="item-actions">
                  <button 
                    className="action-btn edit-btn" 
                    onClick={(e) => renameChat(c.id, e)} 
                    title="Rename Chat"
                    aria-label="Rename chat"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                    </svg>
                  </button>
                  <button 
                    className="action-btn delete-btn" 
                    onClick={(e) => deleteChat(c.id, e)} 
                    title="Delete Chat"
                    aria-label="Delete chat"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <polyline points="3 6 5 6 21 6"></polyline>
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Documents Panel */}
        <div className="sidebar-section doc-section">
          <span className="section-label">Documents</span>
          <div className="items-list">
            {documents.length === 0 ? (
              <span style={{ fontSize: '0.775rem', color: 'var(--sidebar-text-muted)', paddingLeft: '0.5rem', fontStyle: 'italic' }}>
                No uploads yet
              </span>
            ) : (
              documents.map(d => (
                <div key={d.id} className="sidebar-item" style={{ cursor: 'default' }}>
                  <span className="item-name" title={d.name}>{d.name}</span>
                  <div className="item-actions" style={{ opacity: 1 }}>
                    <button 
                      className="action-btn delete-btn" 
                      onClick={(e) => deleteDocument(d.id, e)} 
                      title="Delete Document"
                      aria-label="Delete document"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                      </svg>
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </aside>

      {/* 2. Main Area: Selected Chat Conversation */}
      <main className="main-chat-pane">
        {/* Chat Pane Header */}
        <header className="chat-header">
          <div className="chat-header-info">
            <h1 className="chat-header-title">{activeChat ? activeChat.title : 'Voice Assistant'}</h1>
          </div>

          <div className="chat-header-actions">
            {/* Show badge if a document is attached */}
            {attachedDoc && (
              <div className="attachment-badge">
                <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                </svg>
                <span>{attachedDoc.name}</span>
                <button onClick={() => handleAttachDocument(null)} title="Detach Document" aria-label="Detach document">&times;</button>
              </div>
            )}

            {/* Document Selector */}
            <select 
              className="doc-attach-selector"
              value={activeChat?.selectedDocId || ''}
              onChange={(e) => handleAttachDocument(e.target.value)}
              aria-label="Attach document context to chat"
            >
              <option value="">Attach Document</option>
              {documents.map(d => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>

            {/* User Profile edit three-dots button */}
            <button 
              className="profile-dots-btn" 
              onClick={handleEditProfile} 
              title="Edit Profile Name"
              aria-label="Edit profile name"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
                <path d="M6 10c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm12 0c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm-6 0c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/>
              </svg>
            </button>
          </div>
        </header>

        {/* Error notification */}
        {localError && (
          <div className="error-banner" role="alert">
            <span>{localError}</span>
            <button className="error-close-btn" onClick={dismissError} aria-label="Dismiss error">&times;</button>
          </div>
        )}

        {/* Render chat history logs */}
        <ChatHistory 
          messages={messages} 
          isProcessing={isProcessing} 
          bottomRef={bottomRef} 
          onSelectSuggestion={handleUserUtterance}
          userName={userName}
        />

        {/* Interactive controls and state indicators */}
        <div className="controls-panel">
          
          {/* Status Display */}
          <div className="status-display">
            {isListening && (
              <span className="status-listening">
                <span className="status-dot" /> Listening...
              </span>
            )}
            {isProcessing && (
              <span className="status-processing">
                <span className="status-dot" /> Processing question...
              </span>
            )}
            {isSpeaking && (
              <span className="status-speaking">
                <span className="status-dot" /> Speaking...
              </span>
            )}
            {!isListening && !isProcessing && !isSpeaking && (
              <span className="status-idle">
                <span className="status-dot" /> Ready
              </span>
            )}
          </div>

          {/* Visualizer Wave */}
          <Visualizer isListening={isListening} isSpeaking={isSpeaking} />

          {/* Hidden file input for the plus button file picker */}
          <input 
            type="file" 
            ref={fileInputRef}
            style={{ display: 'none' }}
            accept=".txt,.md,.csv,.json,.xml,.js,.html,.pdf,application/pdf" 
            onChange={handleDocumentUpload} 
          />

          {/* Combined Pill Input Container (Consolidates Plus, Text Input, Mic, Mute, Send) */}
          <div className="input-row">
            {/* Left Action: Plus Upload Button */}
            <button 
              type="button" 
              className="plus-attach-btn" 
              onClick={handlePlusAttachClick}
              title="Upload Document context"
              aria-label="Upload document"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="16" height="16">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
            </button>

            {/* Input Form */}
            <form onSubmit={handleTextSubmit} className="chat-input-form">
              <input 
                type="text" 
                value={textInput} 
                onChange={(e) => setTextInput(e.target.value)}
                placeholder="Ask anything..." 
                className="text-chat-input"
                disabled={isProcessing || isListening}
                aria-label="Text message input"
              />

              {/* Right-aligned actions (Mute + Mic + Send) */}
              <div className="right-input-actions">
                {/* Mute/Unmute Toggle Button */}
                <button 
                  type="button" 
                  className={`mute-button ${isMuted ? 'muted' : ''}`}
                  onClick={handleMuteToggle}
                  title={isMuted ? "Unmute voice output" : "Mute voice output"}
                  aria-label={isMuted ? "Unmute voice" : "Mute voice"}
                >
                  {isMuted ? (
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
                      <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.21.05-.42.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>
                    </svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
                      <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
                    </svg>
                  )}
                </button>

                <MicButton 
                  isListening={isListening} 
                  isProcessing={isProcessing} 
                  isSpeaking={isSpeaking} 
                  onClick={handleMicClick} 
                />
                
                <button 
                  type="submit" 
                  className="text-send-button"
                  disabled={isProcessing || isListening || !textInput.trim()}
                  aria-label="Send message"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="12" height="12">
                    <line x1="12" y1="19" x2="12" y2="5"></line>
                    <polyline points="5 12 12 5 19 12"></polyline>
                  </svg>
                </button>
              </div>
            </form>
          </div>
          
          <span className="help-tip">
            {isSpeaking ? "Tap microphone to interrupt speech" : "Tap microphone to speak, or type and press Enter"}
          </span>
        </div>
      </main>
    </div>
  );
}
