import { test, expect } from '@playwright/test';
import path from 'path';

test.describe('Page Context Analysis', () => {
    test.beforeEach(async ({ page }) => {
        // Calculate absolute path for sidebar.html
        const sidebarUrl = `file://${path.resolve(__dirname, '../dist/sidebar.html')}`;

        // Mock chrome API
        await page.addInitScript((url) => {
            const listeners: any[] = [];
            (window as any).chrome = {
                runtime: {
                    getURL: (pathVal: string) => {
                         if (pathVal === 'sidebar.html') return url;
                         return pathVal;
                    },
                    onMessage: {
                        addListener: (cb: any) => listeners.push(cb)
                    }
                },
                tabs: {
                    query: async () => [{ id: 1 }],
                    sendMessage: async (tabId: number, msg: any) => {
                        if (msg.action === 'get_page_content') {
                            return { content: 'Sample page content for testing. This contains some text.' };
                        }
                    }
                },
                storage: {
                    local: {
                        get: async () => ({ gemini_api_key: 'mock-key' }),
                        set: async () => {}
                    }
                }
            };
        }, sidebarUrl);

        // Load Sidebar directly for unit testing logic
        await page.goto(sidebarUrl);
    });

    test('should show Scan button in input area', async ({ page }) => {
        const scanBtn = page.locator('#scan-page-btn');
        await expect(scanBtn).toBeVisible();
    });

    test('clicking Scan should trigger analysis and show Summarize option for plain text', async ({ page }) => {
        const scanBtn = page.locator('#scan-page-btn');
        await scanBtn.click();

        // Wait for AI message
        const aiMsg = page.locator('.message.ai').last();
        await expect(aiMsg).toContainText('Načítal som obsah stránky');
        
        // Should show "Summarize" as primary because text is short/plain
        const summarizeBtn = aiMsg.locator('button[data-action="summarize"]');
        await expect(summarizeBtn).toBeVisible();
        await expect(summarizeBtn).toHaveClass(/primary-btn/); // Primary because it's content
    });

    test('clicking Summarize should send prompt to chat input logic', async ({ page }) => {
        const scanBtn = page.locator('#scan-page-btn');
        await scanBtn.click();

        const summarizeBtn = page.locator('button[data-action="summarize"]').first();
        await summarizeBtn.click();

        // Check if a User message appeared with the context and task
        const userMsgs = page.locator('.message.user');
        
        // Wait for the prompt to appear in chat
        await expect(userMsgs.last()).toContainText('Context:');
        await expect(userMsgs.last()).toContainText('Task: Summarize');
    });
});
