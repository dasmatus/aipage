// i18n - Internationalization for AiPage Sidebar

import browser from "../polyfills/browser-polyfill";
import { Translation } from './locales/interface';
import { sk } from './locales/sk';
import { en } from './locales/en';
import { cs } from './locales/cs';
import { de } from './locales/de';
import { hu } from './locales/hu';

export type { Translation };

export const LANGUAGE_NAMES: Record<string, string> = {
    sk: 'Slovak',
    en: 'English',
    cs: 'Czech',
    de: 'German',
    hu: 'Hungarian',
};

export const translations: Record<string, Translation> = {
    sk,
    en,
    cs,
    de,
    hu
};

// Get translation for current language
export function t(key: keyof Translation, lang: string = 'sk'): string {
    const translation = translations[lang] || translations['sk'];
    return translation[key] || translations['sk'][key];
}

// Get current language from storage or default
export async function getCurrentLanguage(): Promise<string> {
    try {
        const result = await browser.storage.local.get('language') as { language?: string };
        return result.language || 'sk';
    } catch (error) {
        console.error('Failed to get language:', error);
        return 'sk';
    }
}

// Set language in storage
export async function setLanguage(lang: string): Promise<void> {
    try {
        await browser.storage.local.set({ language: lang });
    } catch (error) {
        console.error('Failed to set language:', error);
    }
}
