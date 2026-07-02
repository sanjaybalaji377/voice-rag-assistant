/**
 * Service to handle client-server communication.
 */

/**
 * Sends conversation history to the backend API.
 * @param {Array<{role: string, content: string}>} messages - The conversation thread.
 * @returns {Promise<string>} The AI response transcription text.
 */
export async function sendChatMessage(messages, activeDocumentId = null, timeoutMs = 15000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);

  try {
    // Relative URL works because of Vite proxy configured in vite.config.js
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ 
        messages,
        active_document_id: activeDocumentId
      }),
      signal: controller.signal
    });

    clearTimeout(id);

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || `Server responded with error status ${response.status}`);
    }

    if (!data.response) {
      throw new Error("Empty response received from Voice AI Server.");
    }

    return data.response;
  } catch (error) {
    clearTimeout(id);
    console.error("sendChatMessage network/API failure:", error);
    if (error.name === 'AbortError') {
      throw new Error("Request timed out. The Voice AI server took too long to respond. Please try again.");
    }
    throw new Error(error.message || "Failed to communicate with chat server. Please ensure the backend is running.");
  }
}
