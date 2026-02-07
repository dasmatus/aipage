
import { test, expect } from '@playwright/test';
import path from 'path';

test.describe('OCR Functionality', () => {
    test.beforeEach(async ({ page }) => {
        page.on('console', msg => console.log(`[Browser] ${msg.text()}`));
    });

    const setupMocks = async (page) => {
        await page.addInitScript(() => {
            window.chrome = {
                storage: { 
                    local: { 
                        get: (k: any, cb: any) => {
                            // Mock provider to be local so it doesn't force settings view
                            const res = { ai_provider: 'ollama' };
                            if (cb) cb(res);
                            return Promise.resolve(res);
                        }, 
                        set: (i: any, cb: any) => {
                            if (cb) cb();
                            return Promise.resolve();
                        }
                    } 
                },
                runtime: {
                    getURL: (p: string) => p,
                    sendMessage: (msg: any, cb: any) => {
                        console.log('Mocked runtime.sendMessage:', msg.action);
                        const res = msg.action === 'proxy_fetch' 
                            ? { ok: true, data: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==' }
                            : { ok: true };
                        if (cb) cb(res);
                        return Promise.resolve(res);
                    }
                },
                tabs: {
                    query: (q: any, cb: any) => {
                        const res = [{ id: 1 }];
                        if (cb) cb(res);
                        return Promise.resolve(res);
                    },
                    sendMessage: (id: any, msg: any, optionsOrCb?: any, cb?: any) => {
                        const actualCb = typeof optionsOrCb === 'function' ? optionsOrCb : cb;
                        console.log('Mocked tabs.sendMessage:', msg.action);
                        if (msg.action === 'get_page_content') {
                            const res = {
                                content: 'OCR Test Content?',
                                isSelection: true,
                                images: ['http://example.com/ocr.png']
                            };
                            if (actualCb) actualCb(res);
                            return Promise.resolve(res);
                        }
                        if (actualCb) actualCb({ ok: true });
                        return Promise.resolve({ ok: true });
                    }
                }
            } as any;
            (window as any).browser = window.chrome;
            
            // Mock Tesseract globally
            (window as any).Tesseract = {
                recognize: async () => ({
                    data: { text: "MOCKED OCR RESULT" }
                })
            };
        });
    };

    test('should display detected images and allow OCR', async ({ page }) => {
        await setupMocks(page);
        const sidebarPath = path.join(__dirname, '../dist-chrome/sidebar.html');
        await page.goto(`file://${sidebarPath}`);

        // Wait for scan button (ensures we are in chat view)
        const scanBtn = page.locator('#scan-page-btn');
        await expect(scanBtn).toBeVisible({ timeout: 10000 });
        await scanBtn.click();

        // Check for badge
        const badge = page.locator('button[title="OCR Detected Image"]');
        await expect(badge).toBeVisible({ timeout: 10000 });
        await expect(badge).toHaveText('1');

        // Click it
        await badge.click();

        // Check input
        const input = page.locator('#chat-input');
        await expect(input).toHaveValue(/MOCKED OCR RESULT/);
    });
});
