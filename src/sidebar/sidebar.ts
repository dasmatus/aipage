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
    baseUrlInput: document.getElementById('base-url') as HTMLInputElement, // Updated ID
    modelNameInput: document.getElementById('model-name') as HTMLInputElement, // Updated ID
    modelSelect: document.getElementById('model-select') as HTMLSelectElement,
    refreshModelsBtn: document.getElementById('refresh-models-btn') as HTMLButtonElement,
    localSettingsDiv: document.getElementById('local-settings') as HTMLDivElement,
    saveKeyBtn: document.getElementById('save-key-btn') as HTMLButtonElement,
    backBtn: document.getElementById('back-btn') as HTMLButtonElement,
    chatHistory: document.getElementById('chat-history') as HTMLDivElement,
    chatInput: document.getElementById('chat-input') as HTMLTextAreaElement,
    sendBtn: document.getElementById('send-btn') as HTMLButtonElement,
    themeSelect: document.getElementById('theme-select') as HTMLSelectElement,
    globalThemeToggle: document.getElementById('global-theme-toggle') as HTMLInputElement
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
    if (elements.providerSelect) elements.providerSelect.value = currentProvider;

    // 2. Load keys and local settings
    await refreshProviderState();

    // 3. Load theme & global toggle
    const theme = await Storage.getThemePreference();
    if (elements.themeSelect) elements.themeSelect.value = theme;
    document.body.dataset.theme = theme;

    // Global override defaults to disabled (false)
    const stored = await chrome.storage.local.get('ai_sidebar_global');
    if (elements.globalThemeToggle) {
        elements.globalThemeToggle.checked = !!stored.ai_sidebar_global;
    }

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
    // In case elements are missing (defensive)
    if (!elements.apiKeyInput) return;

    // 1. API Key
    apiKey = await Storage.getApiKey(currentProvider);
    elements.apiKeyInput.value = apiKey || '';

    // 2. Local Settings & Model Dropdown
    const isLocal = currentProvider === 'lmstudio' || currentProvider === 'ollama';
    
    if (isLocal) {
        const settings = await Storage.getLocalSettings(currentProvider);
        if (elements.baseUrlInput) elements.baseUrlInput.value = settings.url;
        if (elements.modelNameInput) elements.modelNameInput.value = settings.model;

        // Fallbacks
        if (elements.baseUrlInput && !elements.baseUrlInput.value) {
            elements.baseUrlInput.value = currentProvider === 'lmstudio'
                ? 'http://localhost:1234/v1'
                : 'http://localhost:11434';
        }

        // Toggle UI elements
        if (elements.modelNameInput) elements.modelNameInput.classList.add('hidden');
        if (elements.modelSelect) elements.modelSelect.classList.remove('hidden');
        if (elements.refreshModelsBtn) elements.refreshModelsBtn.classList.remove('hidden');
        
        // Populate Models
        await populateModelSelect(currentProvider, settings.model);

    } else {
        // Cloud Provider
        if (elements.modelNameInput) elements.modelNameInput.classList.remove('hidden');
        if (elements.modelSelect) elements.modelSelect.classList.add('hidden');
        if (elements.refreshModelsBtn) elements.refreshModelsBtn.classList.add('hidden');
    }

    UI.updateProviderInstructions(currentProvider);
    UI.toggleLocalSettingsVisibility(currentProvider, elements.localSettingsDiv);
}

// Helper to populate model select
async function populateModelSelect(provider: ProviderType, selectedModel: string) {
    if (!elements.modelSelect) return;
    elements.modelSelect.innerHTML = '<option value="" disabled>Načítavam...</option>';

    // Try fetching from storage first
    let models: string[] = [];
    const storageKey = `cached_models_${provider}`;
    const stored = await chrome.storage.local.get(storageKey);
    
    if (stored[storageKey] && Array.isArray(stored[storageKey]) && stored[storageKey].length > 0) {
        models = stored[storageKey];
    } else {
        // If not in storage, try to fetch immediately (background-ish)
        models = await fetchModelsFromProvider(provider);
    }

    renderModelOptions(models, selectedModel);
}

async function fetchModelsFromProvider(provider: ProviderType): Promise<string[]> {
    try {
        const p = import('./providers').then(m => m.getProvider(provider));
        const providerInstance = await p;
        
        if (providerInstance && providerInstance.getModels) {
            const baseUrl = elements.baseUrlInput?.value;
            const models = await providerInstance.getModels('', { baseUrl });
            
            // Save to storage
            await chrome.storage.local.set({ [`cached_models_${provider}`]: models });
            return models; 
        }
    } catch (e) {
        console.warn('Could not fetch models:', e);
    }
    return [];
}

function renderModelOptions(models: string[], selected: string) {
    if (!elements.modelSelect) return;
    elements.modelSelect.innerHTML = '';
    
    if (models.length === 0) {
        const opt = document.createElement('option');
        opt.text = "Žiadne modely sa nenašli (skontrolujte URL)";
        elements.modelSelect.appendChild(opt);
        return;
    }

    models.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m;
        opt.text = m;
        if (m === selected) opt.selected = true;
        elements.modelSelect.appendChild(opt);
    });
    
    // Add current selection if not in list (custom or stale)
    if (selected && !models.includes(selected)) {
         const opt = document.createElement('option');
         opt.value = selected;
         opt.text = `${selected} (Aktuálny)`;
         opt.selected = true;
         elements.modelSelect.appendChild(opt);
    }
}

// --- Event Listeners ---

// Header Navigation
if (elements.settingsBtn) {
    elements.settingsBtn.addEventListener('click', () => {
        UI.switchView(elements.settingsView, elements.chatView);
    });
}

if (elements.backBtn) {
    elements.backBtn.addEventListener('click', () => {
        const isLocal = currentProvider === 'lmstudio' || currentProvider === 'ollama';
        if (apiKey || isLocal) {
            UI.switchView(elements.chatView, elements.settingsView);
        }
    });
}

// Settings Management
if (elements.providerSelect) {
    elements.providerSelect.addEventListener('change', async () => {
        currentProvider = elements.providerSelect.value as ProviderType;
        await Storage.saveProviderPreference(currentProvider);
        await refreshProviderState();
    });
}

if (elements.themeSelect) {
    elements.themeSelect.addEventListener('change', async () => {
        const theme = elements.themeSelect.value;
        await Storage.saveThemePreference(theme);
        document.body.dataset.theme = theme;
    });
}

if (elements.globalThemeToggle) {
    elements.globalThemeToggle.addEventListener('change', async () => {
        await chrome.storage.local.set({ ai_sidebar_global: elements.globalThemeToggle.checked });
    });
}

// Refresh models button
if (elements.refreshModelsBtn) {
    elements.refreshModelsBtn.addEventListener('click', async () => {
        elements.refreshModelsBtn.textContent = 'Obnovujem...';
        elements.refreshModelsBtn.disabled = true;
        
        const models = await fetchModelsFromProvider(currentProvider);
        renderModelOptions(models, elements.modelSelect.value || elements.modelNameInput.value);
        
        elements.refreshModelsBtn.textContent = '↻ Obnoviť modely';
        elements.refreshModelsBtn.disabled = false;
    });
}

// Model Select Change -> Update Hidden Input
if (elements.modelSelect) {
    elements.modelSelect.addEventListener('change', () => {
        if (elements.modelNameInput) {
            elements.modelNameInput.value = elements.modelSelect.value;
        }
    });
}


if (elements.saveKeyBtn) {
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
            // Ensure we capture the model from the select if active
            const modelVal = (!elements.modelSelect.classList.contains('hidden') && elements.modelSelect.value) 
                ? elements.modelSelect.value 
                : elements.modelNameInput.value.trim();

            await Storage.saveLocalSettings(
                currentProvider,
                elements.baseUrlInput.value.trim(),
                modelVal
            );
        }

        alert('Nastavenia uložené!');
        UI.switchView(elements.chatView, elements.settingsView);
    });
}

// Chat Interaction
if (elements.chatInput) {
    elements.chatInput.addEventListener('input', () => {
        if (elements.sendBtn) elements.sendBtn.disabled = !elements.chatInput.value.trim();
        UI.autoResizeTextarea(elements.chatInput);
    });

    elements.chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    });
}

if (elements.sendBtn) {
    elements.sendBtn.addEventListener('click', handleSend);
}

async function handleSend() {
    const text = elements.chatInput.value.trim();
    if (!text) return;

    // Clear input immediately for UX
    elements.chatInput.value = '';
    if (elements.sendBtn) elements.sendBtn.disabled = true;
    UI.autoResizeTextarea(elements.chatInput);

    const isLocal = currentProvider === 'lmstudio' || currentProvider === 'ollama';
    const options = isLocal ? {
        baseUrl: elements.baseUrlInput.value.trim(),
        modelName: elements.modelNameInput.value.trim() // We expect this to be up-to-date
    } : undefined;

    await chatManager.sendMessage(text, currentProvider, apiKey, options);
}

// Let's go!
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        initSidebar().catch(err => console.error('Sidebar init failed:', err));
    });
} else {
    initSidebar().catch(err => console.error('Sidebar init failed:', err));
}
