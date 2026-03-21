/**
 * Storage Module
 * Handles all browser storage interactions for the extension.
 */

import browser from 'webextension-polyfill';
import { ProviderType } from './providers';

/**
 * Keys used for chrome.storage.local
 */
export const STORAGE_KEYS = {
    PROVIDER: 'ai_provider',
    API_KEYS: {
        lmstudio: 'lmstudio_api_key',
        ollama: 'ollama_api_key',
        vercel: 'vercel_api_key'
    },
    LOCAL_SETTINGS: {
        lmstudio: { url: 'lmstudio_base_url', model: 'lmstudio_model' },
        ollama: { url: 'ollama_base_url', model: 'ollama_model' },
        vercel: { url: 'vercel_base_url', model: 'vercel_model' }
    },
    THEME: 'ai_sidebar_theme',
    EXA_API_KEY: 'exa_api_key',
    EXA_ENABLED: 'exa_enabled',
    SEARXNG_URL: 'searxng_url',
    SEARXNG_ENABLED: 'searxng_enabled',
    IMAGE_GEN_ENABLED: 'image_gen_enabled',
    IMAGE_GEN_PROVIDER: 'image_gen_provider',
    IMAGE_GEN_SD_URL: 'image_gen_sd_url',
    IMAGE_GEN_MODEL: 'image_gen_model',
    IMAGE_GEN_SIZE: 'image_gen_size',
    AUTO_ANSWER_ENABLED: 'auto_answer_enabled',
    WIDGET_NOTES: 'widget_notes',
};

/**
 * Retrieves the user's preferred AI provider.
 * @returns {Promise<ProviderType>}
 */
export async function getProviderPreference(): Promise<ProviderType> {
    const result = await browser.storage.local.get([STORAGE_KEYS.PROVIDER]) as Record<string, any>;
    const p = result[STORAGE_KEYS.PROVIDER];
    if (p === 'lmstudio' || p === 'ollama' || p === 'vercel') return p;
    return 'vercel';
}

/**
 * Saves the user's preferred AI provider.
 * @param {ProviderType} provider 
 */
export async function saveProviderPreference(provider: ProviderType): Promise<void> {
    await browser.storage.local.set({ [STORAGE_KEYS.PROVIDER]: provider });
}

export async function getProviderBackendPreference(): Promise<'vercel' | 'ollama' | 'lmstudio'> {
    const result = await browser.storage.local.get('providerBackend');
    return (result.providerBackend as 'vercel' | 'ollama' | 'lmstudio') || 'vercel';
}

export async function saveProviderBackendPreference(backend: 'vercel' | 'ollama' | 'lmstudio'): Promise<void> {
    await browser.storage.local.set({ providerBackend: backend });
}

/**
 * Loads the API key for a specific provider.
 * @param {ProviderType} provider 
 * @returns {Promise<string | null>}
 */
export async function getApiKey(provider: ProviderType): Promise<string | null> {
    const key = STORAGE_KEYS.API_KEYS[provider as keyof typeof STORAGE_KEYS.API_KEYS];
    if (!key) return null;
    const result = await browser.storage.local.get([key]) as Record<string, any>;
    return (result[key] as string) || null;
}

/**
 * Saves local settings for providers like LM Studio or Ollama.
 * @param {ProviderType} provider 
 * @param {string} url 
 * @param {string} model 
 */
export async function saveLocalSettings(provider: ProviderType, url: string, model: string): Promise<void> {
    if (provider !== 'lmstudio' && provider !== 'ollama' && provider !== 'vercel') return;
    const keys = STORAGE_KEYS.LOCAL_SETTINGS[provider];
    await browser.storage.local.set({
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
    if (provider !== 'lmstudio' && provider !== 'ollama' && provider !== 'vercel') {
        return { url: '', model: '' };
    }
    const keys = STORAGE_KEYS.LOCAL_SETTINGS[provider];
    const result = await browser.storage.local.get([keys.url, keys.model]) as Record<string, any>;
    return {
        url: (result[keys.url] as string) || '',
        model: (result[keys.model] as string) || ''
    };
}

/**
 * Retrieves the user's preferred theme.
 * @returns {Promise<string>}
 */
export async function getThemePreference(): Promise<string> {
    const result = await browser.storage.local.get([STORAGE_KEYS.THEME]) as Record<string, any>;
    return (result[STORAGE_KEYS.THEME] as string) || 'default';
}

/**
 * Saves the user's preferred theme.
 * @param {string} theme 
 */
export async function saveThemePreference(theme: string): Promise<void> {
    await browser.storage.local.set({ [STORAGE_KEYS.THEME]: theme });
}

export async function getExaApiKey(): Promise<string | null> {
    const result = await browser.storage.local.get([STORAGE_KEYS.EXA_API_KEY]) as Record<string, any>;
    return (result[STORAGE_KEYS.EXA_API_KEY] as string) || null;
}

export async function saveExaApiKey(key: string): Promise<void> {
    await browser.storage.local.set({ [STORAGE_KEYS.EXA_API_KEY]: key });
}

export async function getExaEnabled(): Promise<boolean> {
    const result = await browser.storage.local.get([STORAGE_KEYS.EXA_ENABLED]) as Record<string, any>;
    return !!result[STORAGE_KEYS.EXA_ENABLED];
}

export async function saveExaEnabled(enabled: boolean): Promise<void> {
    await browser.storage.local.set({ [STORAGE_KEYS.EXA_ENABLED]: enabled });
}

export async function getSearXNGUrl(): Promise<string> {
    const result = await browser.storage.local.get([STORAGE_KEYS.SEARXNG_URL]) as Record<string, any>;
    return (result[STORAGE_KEYS.SEARXNG_URL] as string) || '';
}

export async function saveSearXNGUrl(url: string): Promise<void> {
    await browser.storage.local.set({ [STORAGE_KEYS.SEARXNG_URL]: url });
}

export async function getSearXNGEnabled(): Promise<boolean> {
    const result = await browser.storage.local.get([STORAGE_KEYS.SEARXNG_ENABLED]) as Record<string, any>;
    return !!result[STORAGE_KEYS.SEARXNG_ENABLED];
}

export async function saveSearXNGEnabled(enabled: boolean): Promise<void> {
    await browser.storage.local.set({ [STORAGE_KEYS.SEARXNG_ENABLED]: enabled });
}

export async function getImageGenEnabled(): Promise<boolean> {
    const result = await browser.storage.local.get([STORAGE_KEYS.IMAGE_GEN_ENABLED]) as Record<string, any>;
    return !!result[STORAGE_KEYS.IMAGE_GEN_ENABLED];
}

export async function saveImageGenEnabled(enabled: boolean): Promise<void> {
    await browser.storage.local.set({ [STORAGE_KEYS.IMAGE_GEN_ENABLED]: enabled });
}

export async function getImageGenProvider(): Promise<'vercel' | 'sdwebui'> {
    const result = await browser.storage.local.get([STORAGE_KEYS.IMAGE_GEN_PROVIDER]) as Record<string, any>;
    return (result[STORAGE_KEYS.IMAGE_GEN_PROVIDER] as 'vercel' | 'sdwebui') || 'vercel';
}

export async function saveImageGenProvider(provider: 'vercel' | 'sdwebui'): Promise<void> {
    await browser.storage.local.set({ [STORAGE_KEYS.IMAGE_GEN_PROVIDER]: provider });
}

export async function getImageGenSdUrl(): Promise<string> {
    const result = await browser.storage.local.get([STORAGE_KEYS.IMAGE_GEN_SD_URL]) as Record<string, any>;
    return (result[STORAGE_KEYS.IMAGE_GEN_SD_URL] as string) || 'http://localhost:7860';
}

export async function saveImageGenSdUrl(url: string): Promise<void> {
    await browser.storage.local.set({ [STORAGE_KEYS.IMAGE_GEN_SD_URL]: url });
}

export async function getImageGenModel(): Promise<string> {
    const result = await browser.storage.local.get([STORAGE_KEYS.IMAGE_GEN_MODEL]) as Record<string, any>;
    return (result[STORAGE_KEYS.IMAGE_GEN_MODEL] as string) || 'openai:dall-e-3';
}

export async function saveImageGenModel(model: string): Promise<void> {
    await browser.storage.local.set({ [STORAGE_KEYS.IMAGE_GEN_MODEL]: model });
}

export async function getImageGenSize(): Promise<string> {
    const result = await browser.storage.local.get([STORAGE_KEYS.IMAGE_GEN_SIZE]) as Record<string, any>;
    return (result[STORAGE_KEYS.IMAGE_GEN_SIZE] as string) || '1024x1024';
}

export async function saveImageGenSize(size: string): Promise<void> {
    await browser.storage.local.set({ [STORAGE_KEYS.IMAGE_GEN_SIZE]: size });
}

export async function getAutoAnswerEnabled(): Promise<boolean> {
    const result = await browser.storage.local.get([STORAGE_KEYS.AUTO_ANSWER_ENABLED]) as Record<string, any>;
    return !!result[STORAGE_KEYS.AUTO_ANSWER_ENABLED];
}

export async function saveAutoAnswerEnabled(enabled: boolean): Promise<void> {
    await browser.storage.local.set({ [STORAGE_KEYS.AUTO_ANSWER_ENABLED]: enabled });
}

export async function getWidgetNotes(): Promise<string> {
    const result = await browser.storage.local.get([STORAGE_KEYS.WIDGET_NOTES]) as Record<string, any>;
    return (result[STORAGE_KEYS.WIDGET_NOTES] as string) || '';
}

export async function saveWidgetNotes(notes: string): Promise<void> {
    await browser.storage.local.set({ [STORAGE_KEYS.WIDGET_NOTES]: notes });
}
