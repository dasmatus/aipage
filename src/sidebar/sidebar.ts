// Side Panel Logic

const STORAGE_KEY = 'gemini_api_key';

// Elements
const settingsBtn = document.getElementById('settings-btn') as HTMLButtonElement;
const settingsView = document.getElementById('settings-view') as HTMLDivElement;
const chatView = document.getElementById('chat-view') as HTMLDivElement;
const apiKeyInput = document.getElementById('api-key-input') as HTMLInputElement;
const saveKeyBtn = document.getElementById('save-key-btn') as HTMLButtonElement;
const backBtn = document.getElementById('back-btn') as HTMLButtonElement;
const chatHistory = document.getElementById('chat-history') as HTMLDivElement;
const chatInput = document.getElementById('chat-input') as HTMLTextAreaElement;
const sendBtn = document.getElementById('send-btn') as HTMLButtonElement;

// State
let apiKey: string | null = null;

// Initialize
async function initSidebar() {
    const result = await chrome.storage.local.get([STORAGE_KEY]);
    apiKey = result[STORAGE_KEY];

    if (!apiKey) {
        showSettings();
    } else {
        // Populate input just in case
        apiKeyInput.value = apiKey;
    }
}

// Navigation
function showSettings() {
    settingsView.classList.remove('hidden');
    chatView.classList.add('hidden');
}

function showChat() {
    if (!apiKey) return;
    settingsView.classList.add('hidden');
    chatView.classList.remove('hidden');
}

settingsBtn.addEventListener('click', showSettings);
backBtn.addEventListener('click', () => {
    if (apiKey) showChat();
});

// Settings Logic
saveKeyBtn.addEventListener('click', async () => {
    const key = apiKeyInput.value.trim();
    if (key) {
        await chrome.storage.local.set({ [STORAGE_KEY]: key });
        apiKey = key;
        showChat();
    }
});

// Chat Logic
chatInput.addEventListener('input', () => {
    sendBtn.disabled = !chatInput.value.trim();
    // Auto-resize
    chatInput.style.height = 'auto';
    chatInput.style.height = Math.min(chatInput.scrollHeight, 120) + 'px';
});

chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

sendBtn.addEventListener('click', sendMessage);

async function sendMessage() {
    const text = chatInput.value.trim();
    if (!text || !apiKey) return;

    // Add User Message
    appendMessage('user', text);
    chatInput.value = '';
    chatInput.style.height = 'auto';
    sendBtn.disabled = true;

    // Placeholder AI Message
    const aiMessageDiv = appendMessage('ai', 'Thinking...');

    try {
        const responseText = await fetchGemini(text);
        if (aiMessageDiv.querySelector('.content')) {
            (aiMessageDiv.querySelector('.content') as HTMLElement).innerText = responseText;
        }
    } catch (error) {
        if (aiMessageDiv.querySelector('.content')) {
            (aiMessageDiv.querySelector('.content') as HTMLElement).innerText = "Error: " + error;
        }
    }
}

function appendMessage(role: 'user' | 'ai', text: string) {
    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${role}`;

    const avatar = document.createElement('div');
    avatar.className = 'avatar';
    avatar.textContent = role === 'user' ? 'U' : 'AI';

    const content = document.createElement('div');
    content.className = 'content';
    content.innerText = text; // Simple text for now, can add Markdown later

    msgDiv.appendChild(avatar);
    msgDiv.appendChild(content);

    chatHistory.appendChild(msgDiv);
    chatHistory.scrollTop = chatHistory.scrollHeight;
    return msgDiv;
}

// Simple Gemini Client (Non-streaming for MVP)
async function fetchGemini(prompt: string): Promise<string> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            contents: [{
                parts: [{ text: prompt }]
            }]
        })
    });

    if (!response.ok) {
        throw new Error(`API Error: ${response.statusText}`);
    }

    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || "No response generated.";
}

initSidebar();
