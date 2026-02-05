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
                    getURL: (path: string) => path
                }
            };
        });
    });

    test('should show settings view by default (no API key)', async ({ page }) => {
        await page.goto(`file://${path.resolve(__dirname, '../dist/sidebar.html')}`);

        await expect(page.locator('#settings-view')).not.toHaveClass(/hidden/);
        await expect(page.locator('#chat-view')).toHaveClass(/hidden/);
    });

    test('should allow saving API key and switching to chat', async ({ page }) => {
        await page.goto(`file://${path.resolve(__dirname, '../dist/sidebar.html')}`);

        // Enter API key
        await page.fill('#api-key-input', 'test-api-key');
        await page.click('#save-key-btn');

        // Should switch to chat view
        await expect(page.locator('#settings-view')).toHaveClass(/hidden/);
        await expect(page.locator('#chat-view')).not.toHaveClass(/hidden/);
    });

    test('should persist API key', async ({ page }) => {
        // Pre-seed storage
        await page.addInitScript(() => {
            (window as any).chrome.storage.local.set({ 'gemini_api_key': 'pre-existing-key' });
        });

        await page.goto(`file://${path.resolve(__dirname, '../dist/sidebar.html')}`);

        // Should show chat view immediately
        await expect(page.locator('#chat-view')).not.toHaveClass(/hidden/);
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

        // Check for AI placeholder
        await expect(page.locator('.message.ai .content').last()).toContainText('Thinking...');
    });
});
