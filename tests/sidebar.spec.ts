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

test.describe('Sidebar UI', () => {
    test.beforeEach(async ({ page }) => {
        page.on('console', msg => console.log(`[Browser] ${msg.text()}`));
        // --- Universal Mock Setup ---
        await page.addInitScript(() => {
            const storage: Record<string, any> = {};
            
            // Mock Tabs API
            const mockTabs = {
                query: async (queryInfo: any) => {
                    // Return mock tab for active query
                    if (queryInfo.active && (queryInfo.currentWindow || queryInfo.lastFocusedWindow)) {
                        return [{ id: 1, url: 'https://example.com', title: 'Test Page' }];
                    }
                    return [];
                },
                sendMessage: async (tabId: number, message: any) => {
                    if (message.action === 'get_page_content') {
                        return {
                            content: 'Sample page content',
                            isSelection: false,
                            images: []
                        };
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
                        onChanged: {
                            addListener: () => {} 
                        }
                    }
                },
                runtime: {
                    getURL: (path: string) => path,
                    sendMessage: (message: any, callback: (response: any) => void) => {
                         // Mock interactions with background/LLM
                        if (message.action === 'proxy_fetch') {
                            const url = message.payload.url;
                            
                            // Mock Model Fetching (LM Studio / Ollama)
                            if (url && url.includes('/v1/models')) {
                                setTimeout(() => callback({ ok: true, data: { data: [{ id: 'mock-local-model' }] } }), 10);
                                return;
                            }
                            if (url && url.includes('/api/tags')) {
                                setTimeout(() => callback({ ok: true, data: { models: [{ name: 'mock-ollama-model' }] } }), 10);
                                return;
                            }

                            // Mock Chat Response
                            setTimeout(() => {
                                callback({
                                    ok: true,
                                    data: {
                                        choices: [{ message: { content: 'This is a mocked AI response.' } }],
                                        candidates: [{ content: { parts: [{ text: 'This is a mocked Gemini response.' }] } }],
                                        message: { content: 'This is a mocked Ollama response.' }
                                    }
                                });
                            }, 50);
                        }
                    },
                    onMessage: {
                        addListener: () => {}
                    }
                },
                tabs: mockTabs
            };

            (window as any).chrome = chromeAPI;
            
            // WebExtension Polyfill Mock
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

    test('should show settings view by default when no API key is present', async ({ page }, testInfo) => {
        await page.goto(`file://${resolvePath(getDistPath(testInfo.project.name))}`);

        // Wait for app to initialize (it might render nothing briefly)
        // The App component now calls setIsInitialized(true) after loading storage.
        // If no key is found, it calls setView('settings').
        
        await expect(page.locator('#settings-view')).toBeVisible();
        await expect(page.locator('#chat-view')).toBeHidden();
        await expect(page.locator('#provider-select')).toBeVisible();
    });

    test('should show chat view if API key is already saved', async ({ page }, testInfo) => {
        // Pre-seed storage
        await page.addInitScript(() => {
             (window as any).browser.storage.local.set({
                 'ai_provider': 'gemini', // Ensure keys match storage.ts constants
                 'gemini_api_key': 'existing-key'
             });
        });

        await page.goto(`file://${resolvePath(getDistPath(testInfo.project.name))}`);
        
        await expect(page.locator('#chat-view')).toBeVisible();
        await expect(page.locator('#settings-view')).toHaveClass(/hidden/);
    });

    test('should allow saving API key and switching to chat', async ({ page }, testInfo) => {
        await page.goto(`file://${resolvePath(getDistPath(testInfo.project.name))}`);

        await expect(page.locator('#settings-view')).toBeVisible();

        // Enter key
        await page.fill('#api-key-input', 'new-test-key');
        await page.click('#save-key-btn');

        // Should switch to chat
        await expect(page.locator('#chat-view')).toBeVisible();
        await expect(page.locator('#chat-input')).toBeVisible();
    });

    test('should allow selecting different providers', async ({ page }, testInfo) => {
        await page.goto(`file://${resolvePath(getDistPath(testInfo.project.name))}`);

        // Select OpenAI
        await page.selectOption('#provider-select', 'openai');

        // instructions should change
        await expect(page.locator('[data-provider="openai"]')).toBeVisible();
        await expect(page.locator('[data-provider="gemini"]')).toBeHidden();
    });

    test('should show local settings for LM Studio', async ({ page }, testInfo) => {
        await page.goto(`file://${resolvePath(getDistPath(testInfo.project.name))}`);

        await page.selectOption('#provider-select', 'lmstudio');

        await expect(page.locator('#local-settings')).toBeVisible();
        await expect(page.locator('#base-url')).toHaveValue('http://localhost:1234/v1');
        
        // Wait for potential model fetch mock
        await page.waitForTimeout(100); 
        // The mock returns 'mock-local-model'
        await expect(page.locator('#model-select')).toBeVisible();
    });

    test('should persist language selection', async ({ page }, testInfo) => {
        await page.goto(`file://${resolvePath(getDistPath(testInfo.project.name))}`);
        
        // Select English
        await page.selectOption('#language-select', 'en');
        
        // Verify UI update (e.g. check a label)
        await expect(page.locator('label[for="language-select"]')).toHaveText('LANGUAGE');
        
        // Reload page to verify persistence
        await page.reload();
        await expect(page.locator('#language-select')).toHaveValue('en');
    });

    test('should persist theme selection', async ({ page }, testInfo) => {
        await page.goto(`file://${resolvePath(getDistPath(testInfo.project.name))}`);
        
        const themeSelect = page.locator('select').filter({ has: page.locator('option[value="tokyo"]') });
        await themeSelect.selectOption('tokyo');
        
        await expect(page.locator('body')).toHaveAttribute('data-theme', 'tokyo');
        
        await page.reload();
        await expect(page.locator('body')).toHaveAttribute('data-theme', 'tokyo');
    });

    test('should display sent messages and AI response', async ({ page }, testInfo) => {
        // Setup with key
        await page.addInitScript(() => {
            (window as any).browser.storage.local.set({ 'gemini_api_key': 'test', 'ai_provider': 'gemini' });
        });
        
        await page.goto(`file://${resolvePath(getDistPath(testInfo.project.name))}`);
        
        await expect(page.locator('#chat-input')).toBeVisible();

        await page.fill('#chat-input', 'Hello');
        await page.click('#send-btn');

        // Check user message
        await expect(page.locator('.message.user .content')).toHaveText('Hello');
        
        // Check AI response (wait for mock)
        await expect(page.locator('.message.ai .content').last()).toContainText('mocked');
    });
});
