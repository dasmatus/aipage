
import { test, expect } from '@playwright/test';
import path from 'path';

// Helper to get the correct build path based on project
const getDistPath = (projectName: string) => {
    switch (projectName) {
        case 'firefox':
            return 'dist-firefox/sidebar.html';
        case 'webkit':
            return 'dist-safari/sidebar.html';
        default:
            return 'dist-chrome/sidebar.html';
    }
};

const resolvePath = (relativePath: string) => {
    return path.resolve(process.cwd(), relativePath);
}

test.describe('Language Localization', () => {
    test.beforeEach(async ({ page }) => {
        // --- Universal Mock Setup (Consistent with sidebar.spec.ts) ---
        await page.addInitScript(() => {
            const storage: Record<string, any> = {};
            
            // Mock Tabs API
            const mockTabs = {
                query: async (queryInfo: any) => {
                    if (queryInfo.active && (queryInfo.currentWindow || queryInfo.lastFocusedWindow)) {
                        return [{ id: 1, url: 'https://example.com', title: 'Test Page' }];
                    }
                    return [];
                },
                sendMessage: async (tabId: number, message: any) => {
                    if (message.action === 'get_page_content') {
                        return { content: '', isSelection: false, images: [] };
                    }
                    return {};
                }
            };

            // Mock Runtime & Storage
            const chromeAPI = {
                storage: {
                    local: {
                        get: async (keys: string[] | string, callback?: (result: any) => void) => {
                            const result: Record<string, any> = {};
                            const keyList = Array.isArray(keys) ? keys : [keys];
                            for (const key of keyList) {
                                if (storage[key] !== undefined) {
                                    result[key] = storage[key];
                                }
                            }
                            if (callback) callback(result);
                            return result;
                        },
                        set: async (items: Record<string, any>, callback?: () => void) => {
                            Object.assign(storage, items);
                            if (callback) callback();
                        },
                        onChanged: { addListener: () => {} }
                    }
                },
                runtime: {
                    getURL: (path: string) => path,
                    sendMessage: (message: any, callback: (response: any) => void) => {
                        if (message.action === 'proxy_fetch') {
                            callback({ ok: true });
                        }
                    },
                    onMessage: { addListener: () => {} }
                },
                tabs: mockTabs
            };

            (window as any).chrome = chromeAPI;
            (window as any).browser = {
                storage: chromeAPI.storage,
                runtime: {
                     getURL: chromeAPI.runtime.getURL,
                     sendMessage: async (message: any) => {
                         return new Promise((resolve) => {
                             chromeAPI.runtime.sendMessage(message, resolve);
                         });
                     },
                     onMessage: chromeAPI.runtime.onMessage
                },
                tabs: mockTabs
            };
        });
    });

    test('language dropdown should be visible in settings', async ({ page }, testInfo) => {
        await page.goto(`file://${resolvePath(getDistPath(testInfo.project.name))}`);
        
        await expect(page.locator('#language-select')).toBeVisible();
        
        const options = await page.locator('#language-select option').allTextContents();
        expect(options).toContain('Slovenčina');
        expect(options).toContain('English');
    });

    test('default language should be Slovak and switching updates UI', async ({ page }, testInfo) => {
        await page.goto(`file://${resolvePath(getDistPath(testInfo.project.name))}`);
        
        // Check default
        await expect(page.locator('#language-select')).toHaveValue('sk');
        await expect(page.locator('h2').first()).toHaveText('Vyžaduje sa nastavenie');

        // Switch to English
        await page.selectOption('#language-select', 'en');
        await expect(page.locator('h2').first()).toHaveText('Setup Required');
        await expect(page.locator('#save-key-btn')).toHaveText('Save Key');

        // Switch to German
        await page.selectOption('#language-select', 'de');
        await expect(page.locator('h2').first()).toHaveText('Einrichtung erforderlich');
    });

    test('provider names should be localized', async ({ page }, testInfo) => {
        await page.goto(`file://${resolvePath(getDistPath(testInfo.project.name))}`);

        // Default Slovak
        await expect(page.locator('#provider-select option[value="ollama"]')).toContainText('Lokálne');

        // Switch to English
        await page.selectOption('#language-select', 'en');
        await expect(page.locator('#provider-select option[value="ollama"]')).toContainText('Local');
    });

    test('instructions should be localized per provider', async ({ page }, testInfo) => {
        await page.goto(`file://${resolvePath(getDistPath(testInfo.project.name))}`);

        await page.selectOption('#provider-select', 'gemini');
        await expect(page.locator('.provider-instructions[data-provider="gemini"] h3')).toContainText('Ako získať Gemini API kľúč');

        await page.selectOption('#language-select', 'en');
        await expect(page.locator('.provider-instructions[data-provider="gemini"] h3')).toContainText('How to get a Gemini API key');
    });

    test('theme names should be localized', async ({ page }, testInfo) => {
        await page.goto(`file://${resolvePath(getDistPath(testInfo.project.name))}`);
        
        const themeSelect = page.locator('select').nth(1);
        await expect(themeSelect.locator('option').first()).toContainText('EduPage');

        await page.selectOption('#language-select', 'en');
        await expect(themeSelect.locator('option').first()).toContainText('EduPage (Default)');
    });
});
