import { test, expect } from '@playwright/test';
import path from 'path';

const getDistPath = (projectName: string) => {
    switch (projectName) {
        case 'firefox':
            return '../dist-firefox/sidebar.html';
        case 'webkit':
            return '../dist-safari/sidebar.html';
        default:
            return '../dist-chrome/sidebar.html';
    }
};

test.describe('Sidebar UI', () => {
    test.beforeEach(async ({ page }) => {
        // Mock the chrome API
        await page.addInitScript(() => {
            const storage: Record<string, any> = {};
            (window as any).chrome = {
                storage: {
                    local: {
                        get: async (keys: string[]) => {
                            const result: Record<string, any> = {};
                            for (const key of keys) {
                                if (storage[key]) {
                                    result[key] = storage[key];
                                }
                            }
                            return result;
                        },
                        set: async (items: Record<string, any>) => {
                            Object.assign(storage, items);
                        }
                    }
                },
                runtime: {
                    getURL: (path: string) => path,
                    sendMessage: (message: any, callback: (response: any) => void) => {
                        if (message.action === 'proxy_fetch') {
                            const url = message.payload.url;
                            
                            // Mock Model Fetching
                            if (url.includes('/v1/models')) {
                                setTimeout(() => callback({ ok: true, data: { data: [{ id: 'mock-lmstudio-model' }] } }), 10);
                                return;
                            }
                            if (url.includes('/api/tags')) {
                                setTimeout(() => callback({ ok: true, data: { models: [{ name: 'mock-ollama-model' }] } }), 10);
                                return;
                            }

                            // Mock successful chat response
                            setTimeout(() => {
                                callback({
                                    ok: true,
                                    data: {
                                        choices: [{ message: { content: 'Mocked Response' } }],
                                        candidates: [{ content: { parts: [{ text: 'Mocked Gemini Response' }] } }],
                                        message: { content: 'Mocked Ollama Response' }
                                    }
                                });
                            }, 10);
                        }
                    }
                }
            };
        });
    });

    test('should show settings view by default (no API key)', async ({ page }, testInfo) => {
        await page.goto(`file://${path.resolve(__dirname, getDistPath(testInfo.project.name))}`);

        await expect(page.locator('#settings-view')).toBeVisible();
        await expect(page.locator('#chat-view')).toBeHidden();

        // Provider select should be visible
        await expect(page.locator('#provider-select')).toBeVisible();
    });

    test('should allow selecting different providers', async ({ page }, testInfo) => {
        await page.goto(`file://${path.resolve(__dirname, getDistPath(testInfo.project.name))}`);

        // Select OpenAI
        await page.selectOption('#provider-select', 'openai');

        // OpenAI instructions should be visible
        await expect(page.locator('[data-provider="openai"]')).toBeVisible();
        await expect(page.locator('[data-provider="gemini"]')).toBeHidden();

        // Select Claude
        await page.selectOption('#provider-select', 'claude');
        await expect(page.locator('[data-provider="claude"]')).toBeVisible();
        await expect(page.locator('[data-provider="openai"]')).toBeHidden();
    });

    test('should allow saving API key and switching to chat', async ({ page }, testInfo) => {
        await page.goto(`file://${path.resolve(__dirname, getDistPath(testInfo.project.name))}`);

        // Enter API key for Gemini (default)
        await page.fill('#api-key-input', 'test-gemini-key');
        await page.click('#save-key-btn');

        // Should switch to chat view
        await expect(page.locator('#settings-view')).toHaveClass(/hidden/);
        await expect(page.locator('#chat-view')).not.toHaveClass(/hidden/);
    });

    test('should persist API key for each provider separately', async ({ page }, testInfo) => {
        // Pre-seed storage with multiple provider keys
        await page.addInitScript(() => {
            (window as any).browser.storage.local.set({
                'ai_provider': 'gemini',
                'gemini_api_key': 'gemini-key-123',
                'openai_api_key': 'openai-key-456'
            });
        });

        await page.goto(`file://${path.resolve(__dirname, getDistPath(testInfo.project.name))}`);

        // Should show chat view immediately (has Gemini key)
        await expect(page.locator('#chat-view')).not.toHaveClass(/hidden/);

        // Go to settings and switch to OpenAI
        await page.click('#settings-btn');
        await page.selectOption('#provider-select', 'openai');

        // API key input should show OpenAI key
        await expect(page.locator('#api-key-input')).toHaveValue('openai-key-456');
    });

    test('should display sent messages', async ({ page }, testInfo) => {
        await page.goto(`file://${path.resolve(__dirname, getDistPath(testInfo.project.name))}`);

        // Login first
        await page.fill('#api-key-input', 'test-api-key');
        await page.click('#save-key-btn');

        // Send message
        await page.fill('#chat-input', 'Hello AI');
        await page.click('#send-btn');

        // Check if user message appears
        await expect(page.locator('.message.user .content')).toHaveText('Hello AI');

        // Check for AI response (could be placeholder or final response if fast)
        await expect(page.locator('.message.ai .content').last()).toContainText(/Rozmýšľam|Mocked/);
    });

    test('should display user initials from URL hash', async ({ page }, testInfo) => {
        // Load with initials hash
        await page.goto(`file://${path.resolve(__dirname, getDistPath(testInfo.project.name))}#initials=XK`);

        // Login to enable chat
        await page.fill('#api-key-input', 'test-api-key');
        await page.click('#save-key-btn');

        // Send message
        await page.fill('#chat-input', 'Test Initials');
        await page.click('#send-btn');

        // Check if user avatar displays "XK"
        await expect(page.locator('.message.user .avatar')).toHaveText('XK');
    });

    test('should show local settings for LM Studio and Ollama', async ({ page }, testInfo) => {
        await page.goto(`file://${path.resolve(__dirname, getDistPath(testInfo.project.name))}`);

        // Select LM Studio
        await page.selectOption('#provider-select', 'lmstudio');

        // Local settings should be visible
        await expect(page.locator('#local-settings')).toBeVisible();
        await expect(page.locator('#base-url')).toHaveValue('http://localhost:1234/v1');
        
        // Wait for models to load (the mock takes 10ms)
        await page.waitForTimeout(100);
        
        // After models load, should show select dropdown
        await expect(page.locator('#model-select')).toBeVisible();
        await expect(page.locator('#model-name')).not.toBeVisible();

        // Select Gemini
        await page.selectOption('#provider-select', 'gemini');

        // Local settings should be hidden
        await expect(page.locator('#local-settings')).toBeHidden();
    });

    test('should allow saving local provider settings', async ({ page }, testInfo) => {
        await page.goto(`file://${path.resolve(__dirname, getDistPath(testInfo.project.name))}`);

        // Select Ollama
        await page.selectOption('#provider-select', 'ollama');

        // Wait for model fetch (triggered by selection) - mock takes 10ms
        await page.waitForTimeout(100);

        // Fill settings
        await page.fill('#base-url', 'http://local-ollama:11434');
        
        // After models load, dropdown should appear with mocked model
        await expect(page.locator('#model-select')).toBeVisible();
        await expect(page.locator('#model-select')).toContainText('mock-ollama-model');
        await page.selectOption('#model-select', 'mock-ollama-model');
        
        await page.click('#save-key-btn');

        // Should switch to chat view
        await expect(page.locator('#chat-view')).not.toHaveClass(/hidden/);
    });
});
