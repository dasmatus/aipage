
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


test.describe('Settings & Model Selection', () => {
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
                        // Custom Mock Logic for Models
                        if (message.action === 'proxy_fetch') {
                            const url = message.payload.url;
                             // Mock Model Fetching Error Simulation
                             if (url && url.includes('FAIL_MODELS')) {
                                setTimeout(() => callback({ ok: false, error: 'Failed to fetch models' }), 10);
                                return;
                             }
                            
                            // Mock Model Fetching
                            if (url && (url.includes('/v1/models') || url.includes('/api/tags'))) {
                                setTimeout(() => callback({ 
                                    ok: true, 
                                    data: { data: [{ id: 'llama-3-8b' }, { id: 'mistral-7b' }], models: [{ name: 'ollama-model' }] } 
                                }), 10);
                                return;
                            }
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

    test('should allow selecting local provider and showing models', async ({ page }, testInfo) => {
        await page.goto(`file://${resolvePath(getDistPath(testInfo.project.name))}`);

        // Wait for init
        await expect(page.locator('#settings-view')).toBeVisible();

        // Select LM Studio
        await page.selectOption('#provider-select', 'lmstudio');
        
        // SettingsView should auto-fetch models
        const select = page.locator('#model-select');
        await expect(select).toBeVisible({ timeout: 10000 });
        
        // Wait for options to populate
        await expect(select.locator('option').filter({ hasText: 'llama-3-8b' })).toBeVisible(); 
    });

    test('should show error message on fetch error', async ({ page }, testInfo) => {
        // We need to inject a different mock behavior or trigger the error.
        // Since the mock is static in beforeEach, we can use a magic URL string to trigger error 
        // by modifying the base URL input.
        
        await page.goto(`file://${resolvePath(getDistPath(testInfo.project.name))}`);
        
        await page.selectOption('#provider-select', 'lmstudio');
        
        // Change Base URL to trigger failure in our mock
        await page.fill('#base-url', 'http://localhost:1234/FAIL_MODELS');
        
        // Click refresh (which uses the new URL)
        await page.click('button:has-text("Obnoviť modely"), button:has-text("Refresh models")');

        // Check for error text
        await expect(page.locator('.error-text')).toBeVisible();
        await expect(page.locator('.error-text')).toContainText('Failed');
    });
});
