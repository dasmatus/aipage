/**
 * Storage Module
 * Handles all browser storage interactions for the extension.
 */

import { ProviderType } from './providers';

/**
 * Keys used for chrome.storage.local
 */
export const STORAGE_KEYS = {
    PROVIDER: 'ai_provider',
    API_KEYS: {
        gemini: 'gemini_api_key',
        openai: 'openai_api_key',
        claude: 'claude_api_key',
        mistral: 'mistral_api_key',
        lmstudio: 'lmstudio_api_key',
        ollama: 'ollama_api_key'
    },
    LOCAL_SETTINGS: {
        lmstudio: { url: 'lmstudio_base_url', model: 'lmstudio_model' },
        ollama: { url: 'ollama_base_url', model: 'ollama_model' }
    }
};

/**
 * Retrieves the user's preferred AI provider.
 * @returns {Promise<ProviderType>}
 */
export async function getProviderPreference(): Promise<ProviderType> {
    const result = await chrome.storage.local.get([STORAGE_KEYS.PROVIDER]);
    return (result[STORAGE_KEYS.PROVIDER] || 'gemini') as ProviderType;
}

/**
 * Saves the user's preferred AI provider.
 * @param {ProviderType} provider 
 */
export async function saveProviderPreference(provider: ProviderType): Promise<void> {
    await chrome.storage.local.set({ [STORAGE_KEYS.PROVIDER]: provider });
}

/**
 * Loads the API key for a specific provider.
 * @param {ProviderType} provider 
 * @returns {Promise<string | null>}
 */
export async function getApiKey(provider: ProviderType): Promise<string | null> {
    const key = STORAGE_KEYS.API_KEYS[provider as keyof typeof STORAGE_KEYS.API_KEYS];
    if (!key) return null;
    const result = await chrome.storage.local.get([key]);
    return result[key] || null;
}

/**
 * Saves local settings for providers like LM Studio or Ollama.
 * @param {ProviderType} provider 
 * @param {string} url 
 * @param {string} model 
 */
export async function saveLocalSettings(provider: ProviderType, url: string, model: string): Promise<void> {
    if (provider !== 'lmstudio' && provider !== 'ollama') return;
    const keys = STORAGE_KEYS.LOCAL_SETTINGS[provider];
    await chrome.storage.local.set({
        [keys.url]: url,
        [keys.model]: model
    });
}

/**
 * Loads local settings for a provider.
 * @param {ProviderType} provider 
 * @returns {Promise<{url: string, model: string}>}
 */
export async function getLocalSettings(provider: ProviderType): Promise<{ url: string, model: string }> {
    if (provider !== 'lmstudio' && provider !== 'ollama') {
        return { url: '', model: '' };
    }
    const keys = STORAGE_KEYS.LOCAL_SETTINGS[provider];
    const result = await chrome.storage.local.get([keys.url, keys.model]);
    return {
        url: result[keys.url] || '',
        model: result[keys.model] || ''
    };
}
