/**
 * EduPage AI Sidebar - Main Entry Point
 * 
 * This file orchestrates the sidebar logic by connecting UI components,
 * storage management, and AI chat functionality.
 */

import { ProviderType } from './providers';
import * as Storage from './storage';
import * as UI from './ui-utils';
import { ChatManager } from './chat-manager';

// --- Elements ---
// (We cast to specific HTML types for better IDE support and type-safety)
const elements = {
    settingsBtn: document.getElementById('settings-btn') as HTMLButtonElement,
    settingsView: document.getElementById('settings-view') as HTMLDivElement,
    chatView: document.getElementById('chat-view') as HTMLDivElement,
    providerSelect: document.getElementById('provider-select') as HTMLSelectElement,
    apiKeyInput: document.getElementById('api-key-input') as HTMLInputElement,
    baseUrlInput: document.getElementById('base-url-input') as HTMLInputElement,
    modelNameInput: document.getElementById('model-name-input') as HTMLInputElement,
    localSettingsDiv: document.getElementById('local-settings') as HTMLDivElement,
    saveKeyBtn: document.getElementById('save-key-btn') as HTMLButtonElement,
    backBtn: document.getElementById('back-btn') as HTMLButtonElement,
    chatHistory: document.getElementById('chat-history') as HTMLDivElement,
    chatInput: document.getElementById('chat-input') as HTMLTextAreaElement,
    sendBtn: document.getElementById('send-btn') as HTMLButtonElement,
    themeSelect: document.getElementById('theme-select') as HTMLSelectElement
};

// --- State ---
let currentProvider: ProviderType = 'gemini';
let apiKey: string | null = null;
let chatManager: ChatManager;

/**
 * Initializes the sidebar state and event listeners.
 */
async function initSidebar() {
    chatManager = new ChatManager(elements.chatHistory);

    // 1. Load user preferences
    currentProvider = await Storage.getProviderPreference();
    elements.providerSelect.value = currentProvider;

    // 2. Load keys and local settings
    await refreshProviderState();

    // 3. Load theme
    const theme = await Storage.getThemePreference();
    elements.themeSelect.value = theme;
    document.body.dataset.theme = theme;

    // 4. Navigate to settings if first time (no key for cloud providers)
    const isLocal = currentProvider === 'lmstudio' || currentProvider === 'ollama';
    if (!apiKey && !isLocal) {
        UI.switchView(elements.settingsView, elements.chatView);
    }
}

/**
 * Synchronizes the UI and internal state with the current provider.
 */
async function refreshProviderState() {
    apiKey = await Storage.getApiKey(currentProvider);
    elements.apiKeyInput.value = apiKey || '';

    if (currentProvider === 'lmstudio' || currentProvider === 'ollama') {
        const settings = await Storage.getLocalSettings(currentProvider);
        elements.baseUrlInput.value = settings.url;
        elements.modelNameInput.value = settings.model;

        // Set fallbacks for common local setups
        if (!elements.baseUrlInput.value) {
            elements.baseUrlInput.value = currentProvider === 'lmstudio'
                ? 'http://localhost:1234/v1'
                : 'http://localhost:11434';
        }
    }

    UI.updateProviderInstructions(currentProvider);
    UI.toggleLocalSettingsVisibility(currentProvider, elements.localSettingsDiv);
}

// --- Event Listeners ---

// Header Navigation
elements.settingsBtn.addEventListener('click', () => {
    UI.switchView(elements.settingsView, elements.chatView);
});

elements.backBtn.addEventListener('click', () => {
    const isLocal = currentProvider === 'lmstudio' || currentProvider === 'ollama';
    if (apiKey || isLocal) {
        UI.switchView(elements.chatView, elements.settingsView);
    }
});

// Settings Management
elements.providerSelect.addEventListener('change', async () => {
    currentProvider = elements.providerSelect.value as ProviderType;
    await Storage.saveProviderPreference(currentProvider);
    await refreshProviderState();
});

elements.themeSelect.addEventListener('change', async () => {
    const theme = elements.themeSelect.value;
    await Storage.saveThemePreference(theme);
    document.body.dataset.theme = theme;
});

elements.saveKeyBtn.addEventListener('click', async () => {
    const key = elements.apiKeyInput.value.trim();
    const isLocal = currentProvider === 'lmstudio' || currentProvider === 'ollama';

    if (!key && !isLocal) {
        alert('Prosím, zadajte API kľúč');
        return;
    }

    // Save common API key
    await chrome.storage.local.set({ [Storage.STORAGE_KEYS.API_KEYS[currentProvider]]: key });
    apiKey = key;

    // Save local-only settings
    if (isLocal) {
        await Storage.saveLocalSettings(
            currentProvider,
            elements.baseUrlInput.value.trim(),
            elements.modelNameInput.value.trim()
        );
    }

    alert('Nastavenia uložené!');
    UI.switchView(elements.chatView, elements.settingsView);
});

// Chat Interaction
elements.chatInput.addEventListener('input', () => {
    elements.sendBtn.disabled = !elements.chatInput.value.trim();
    UI.autoResizeTextarea(elements.chatInput);
});

elements.chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
    }
});

elements.sendBtn.addEventListener('click', handleSend);

async function handleSend() {
    const text = elements.chatInput.value.trim();
    if (!text) return;

    // Clear input immediately for UX
    elements.chatInput.value = '';
    elements.sendBtn.disabled = true;
    UI.autoResizeTextarea(elements.chatInput);

    const isLocal = currentProvider === 'lmstudio' || currentProvider === 'ollama';
    const options = isLocal ? {
        baseUrl: elements.baseUrlInput.value.trim(),
        modelName: elements.modelNameInput.value.trim()
    } : undefined;

    await chatManager.sendMessage(text, currentProvider, apiKey, options);
}

// Let's go!
initSidebar();
