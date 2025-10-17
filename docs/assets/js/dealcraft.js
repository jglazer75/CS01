document.addEventListener('DOMContentLoaded', () => {
  // --- STATE ---
  let sessionId = null;
  let isLoading = false;

  // --- UI ELEMENTS ---
  const dealcraftContainer = document.getElementById('dealcraft-container');
  
  // Setup View
  const setupView = document.getElementById('dealcraft-setup');
  const termSheetInput = document.getElementById('term-sheet-input');
  const startButton = document.getElementById('start-negotiation-btn');
  
  // Chat View
  const chatView = document.getElementById('dealcraft-chat');
  const chatHistory = document.getElementById('chat-history');
  const messageInput = document.getElementById('message-input');
  const sendButton = document.getElementById('send-message-btn');
  const statusDisplay = document.getElementById('status-display');

  // --- EVENT LISTENERS ---
  startButton.addEventListener('click', startNegotiation);
  sendButton.addEventListener('click', sendMessage);
  messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  // --- FUNCTIONS ---

  /**
   * Starts a new negotiation session.
   */
  async function startNegotiation() {
    const termSheetFile = document.getElementById('term-sheet-file').files[0];
    const userRole = document.querySelector('input[name="userRole"]:checked')?.value;

    if (!termSheetFile || !userRole) {
      alert('Please select a term sheet file and choose your role.');
      return;
    }

    setLoading(true, 'Uploading and creating session...');

    const formData = new FormData();
    formData.append('action', 'create');
    formData.append('userRole', userRole);
    formData.append('termSheetFile', termSheetFile);

    try {
      const response = await fetch('/api/negotiate', {
        method: 'POST',
        body: formData, // No 'Content-Type' header needed; browser sets it for FormData
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      sessionId = data.sessionId;

      // Switch views
      setupView.style.display = 'none';
      chatView.style.display = 'block';
      addMessageToHistory('System', 'Negotiation session started. You can now send your first message.');

    } catch (error) {
      console.error('Error starting negotiation:', error);
      alert(`Failed to start negotiation session: ${error.message}`);
    } finally {
      setLoading(false);
    }
  }

  /**
   * Sends a message from the user to the backend.
   */
  async function sendMessage() {
    const message = messageInput.value.trim();
    if (!message || !sessionId || isLoading) {
      return;
    }

    addMessageToHistory('User', message);
    messageInput.value = '';
    setLoading(true, 'AI is thinking...');

    try {
      const response = await fetch('/api/negotiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'send_message',
          sessionId,
          message,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      addMessageToHistory('AI', data.aiResponse);

    } catch (error)      {
      console.error('Error sending message:', error);
      addMessageToHistory('System', `Error: Could not get a response from the AI. ${error.message}`);
    } finally {
      setLoading(false);
    }
  }

  /**
   * Adds a message to the chat history display.
   * @param {string} speaker - The speaker ('User', 'AI', or 'System').
   * @param {string} content - The message content.
   */
  function addMessageToHistory(speaker, content) {
    const messageElement = document.createElement('div');
    messageElement.classList.add('chat-message', `${speaker.toLowerCase()}-message`);
    
    const speakerElement = document.createElement('strong');
    speakerElement.textContent = `${speaker}: `;
    
    const contentElement = document.createElement('span');
    contentElement.innerText = content; // Use innerText to prevent HTML injection

    messageElement.appendChild(speakerElement);
    messageElement.appendChild(contentElement);
    
    chatHistory.appendChild(messageElement);
    chatHistory.scrollTop = chatHistory.scrollHeight; // Auto-scroll to bottom
  }

  /**
   * Updates the loading state of the UI.
   * @param {boolean} loading - Whether the UI should be in a loading state.
   * @param {string} [message=''] - An optional message to display.
   */
  function setLoading(loading, message = '') {
    isLoading = loading;
    sendButton.disabled = loading;
    messageInput.disabled = loading;
    statusDisplay.textContent = message;
    statusDisplay.style.display = loading ? 'block' : 'none';
  }
});
