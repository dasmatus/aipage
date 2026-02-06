import { test, expect } from '@playwright/test';
import path from 'path';

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

    test('should show settings view by default (no API key)', async ({ page }) => {
        await page.goto(`file://${path.resolve(__dirname, '../dist/sidebar.html')}`);

        await expect(page.locator('#settings-view')).not.toHaveClass(/hidden/);
        await expect(page.locator('#chat-view')).toHaveClass(/hidden/);

        // Provider select should be visible
        await expect(page.locator('#provider-select')).toBeVisible();
    });

    test('should allow selecting different providers', async ({ page }) => {
        await page.goto(`file://${path.resolve(__dirname, '../dist/sidebar.html')}`);

        // Select OpenAI
        await page.selectOption('#provider-select', 'openai');

        // OpenAI instructions should be visible
        await expect(page.locator('[data-provider="openai"]')).not.toHaveClass(/hidden/);
        await expect(page.locator('[data-provider="gemini"]')).toHaveClass(/hidden/);

        // Select Claude
        await page.selectOption('#provider-select', 'claude');
        await expect(page.locator('[data-provider="claude"]')).not.toHaveClass(/hidden/);
        await expect(page.locator('[data-provider="openai"]')).toHaveClass(/hidden/);
    });

    test('should allow saving API key and switching to chat', async ({ page }) => {
        await page.goto(`file://${path.resolve(__dirname, '../dist/sidebar.html')}`);

        // Enter API key for Gemini (default)
        await page.fill('#api-key-input', 'test-gemini-key');
        await page.click('#save-key-btn');

        // Should switch to chat view
        await expect(page.locator('#settings-view')).toHaveClass(/hidden/);
        await expect(page.locator('#chat-view')).not.toHaveClass(/hidden/);
    });

    test('should persist API key for each provider separately', async ({ page }) => {
        // Pre-seed storage with multiple provider keys
        await page.addInitScript(() => {
            (window as any).chrome.storage.local.set({
                'ai_provider': 'gemini',
                'gemini_api_key': 'gemini-key-123',
                'openai_api_key': 'openai-key-456'
            });
        });

        await page.goto(`file://${path.resolve(__dirname, '../dist/sidebar.html')}`);

        // Should show chat view immediately (has Gemini key)
        await expect(page.locator('#chat-view')).not.toHaveClass(/hidden/);

        // Go to settings and switch to OpenAI
        await page.click('#settings-btn');
        await page.selectOption('#provider-select', 'openai');

        // API key input should show OpenAI key
        await expect(page.locator('#api-key-input')).toHaveValue('openai-key-456');
    });

    test('should display sent messages', async ({ page }) => {
        await page.goto(`file://${path.resolve(__dirname, '../dist/sidebar.html')}`);

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

    test('should show local settings for LM Studio and Ollama', async ({ page }) => {
        await page.goto(`file://${path.resolve(__dirname, '../dist/sidebar.html')}`);

        // Select LM Studio
        await page.selectOption('#provider-select', 'lmstudio');

        // Local settings should be visible
        await expect(page.locator('#local-settings')).not.toHaveClass(/hidden/);
        await expect(page.locator('#base-url')).toHaveValue('http://localhost:1234/v1');
        
        // Settings for Local should show Select and hide Input
        await expect(page.locator('#model-select')).not.toHaveClass(/hidden/);
        await expect(page.locator('#model-name')).toHaveClass(/hidden/);

        // Select Gemini
        await page.selectOption('#provider-select', 'gemini');

        // Local settings should be hidden
        await expect(page.locator('#local-settings')).toHaveClass(/hidden/);
    });

    test('should allow saving local provider settings', async ({ page }) => {
        await page.goto(`file://${path.resolve(__dirname, '../dist/sidebar.html')}`);

        // Select Ollama
        await page.selectOption('#provider-select', 'ollama');

        // Wait for model fetch (triggered by selection)
        await page.waitForTimeout(50);

        // Fill settings
        await page.fill('#base-url', 'http://local-ollama:11434');
        
        // Select a model from the mocked list
        // Note: The mock returns 'mock-ollama-model'.
        // We need to wait for populate to finish? The mock is async 10ms.
        // Let's just force select it or use the default if logic picks header.
        // Actually, logic is: populate -> render.
        // We can just verify the dropdown and select.
        await expect(page.locator('#model-select')).toContainText('mock-ollama-model');
        await page.selectOption('#model-select', 'mock-ollama-model');
        
        await page.click('#save-key-btn');

        // Should switch to chat view
        await expect(page.locator('#chat-view')).not.toHaveClass(/hidden/);
    });
});
