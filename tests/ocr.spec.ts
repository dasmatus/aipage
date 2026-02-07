
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


test.describe('OCR Functionality', () => {
    test.beforeEach(async ({ page }) => {
        // --- Universal Mock Setup ---
        await page.addInitScript(() => {
            const storage: Record<string, any> = { 'gemini_api_key': 'test-key', 'ai_provider': 'gemini' };
            
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
                        return {
                            content: 'OCR Test Content?',
                            isSelection: true,
                            images: ['http://example.com/ocr.png']
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
                        onChanged: { addListener: () => {} }
                    }
                },
                runtime: {
                    getURL: (path: string) => path,
                    sendMessage: (message: any, callback: (response: any) => void) => {
                        if (message.action === 'proxy_fetch') {
                             // Mock image fetch for OCR
                             callback({ ok: true, data: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==' });
                        }
                    },
                    onMessage: {
                        addListener: () => {}
                    }
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

            // Mock Tesseract globally
            (window as any).Tesseract = {
                recognize: async () => ({
                    data: { text: "MOCKED OCR RESULT" }
                })
            };
        });
    });

    test('should display detected images and allow OCR', async ({ page }, testInfo) => {
        await page.goto(`file://${resolvePath(getDistPath(testInfo.project.name))}`);
        // Wait for scan button (ensures we are in chat view)
        const scanBtn = page.locator('#scan-page-btn');
        await expect(scanBtn).toBeVisible({ timeout: 10000 });
        
        // Click scan
        await scanBtn.click();
    
        // Check for badge "OCR Detected Image"
        // Wait for potential async state update
        const badge = page.locator('button[title="OCR Detected Image"]');
        await expect(badge).toBeVisible({ timeout: 10000 });
        await expect(badge).toHaveText('1');

        // Click it
        await badge.click();

        // Check input for result
        const input = page.locator('#chat-input');
        await expect(input).toHaveValue(/MOCKED OCR RESULT/);
    });
});
