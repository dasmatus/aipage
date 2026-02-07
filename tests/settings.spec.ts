
import { test, expect } from '@playwright/test';
import path from 'path';

test.describe('Settings & Model Selection', () => {
    test.beforeEach(async ({ page }) => {
        page.on('console', msg => console.log(`[Browser] ${msg.text()}`));
    });

    const setupMocks = async (page, options: any = {}) => {
        await page.addInitScript((opts) => {
            window.chrome = {
                storage: {
                    local: {
                        get: async (keys: any) => {
                            return Promise.resolve({});
                        },
                        set: async (items: any) => {
                            return Promise.resolve();
                        }
                    }
                },
                runtime: {
                    getURL: (p: string) => p,
                    sendMessage: (msg: any, cb: any) => {
                        console.log('Mocked runtime.sendMessage:', msg.action);
                        if (msg.action === 'proxy_fetch' && msg.payload.url.includes('/models')) {
                            if (opts.failModels) {
                                const res = { ok: false, error: 'Failed' };
                                if (cb) cb(res);
                                return Promise.resolve(res);
                            } else {
                                const res = {
                                    ok: true,
                                    data: JSON.stringify({
                                        data: [{ id: 'llama-3-8b' }, { id: 'mistral-7b' }]
                                    })
                                };
                                if (cb) cb(res);
                                return Promise.resolve(res);
                            }
                        } else {
                            const res = { ok: true };
                            if (cb) cb(res);
                            return Promise.resolve(res);
                        }
                    }
                }
            } as any;
            (window as any).browser = window.chrome;
        }, options);
    };

    test('should allow selecting local provider and showing models', async ({ page }) => {
        await setupMocks(page);
        const sidebarPath = path.join(__dirname, '../dist-chrome/sidebar.html');
        await page.goto(`file://${sidebarPath}`);

        // Open Settings
        await page.click('#settings-btn');
        await expect(page.locator('.settings-content')).toBeVisible();

        // Select LM Studio
        await page.selectOption('#provider-select', 'lmstudio');
        
        // SettingsView should auto-fetch models
        const select = page.locator('#model-select');
        await expect(select).toBeVisible({ timeout: 10000 });
        
        const optionsLines = await select.locator('option').allInnerTexts();
        expect(optionsLines).toContain('llama-3-8b');
    });

    test('should NOT fallback to text input on fetch error', async ({ page }) => {
        await setupMocks(page, { failModels: true });
        const sidebarPath = path.join(__dirname, '../dist-chrome/sidebar.html');
        await page.goto(`file://${sidebarPath}`);

        await page.click('#settings-btn');
        await page.selectOption('#provider-select', 'lmstudio');

        // Dropdown should still be there but maybe show error
        await expect(page.locator('#model-select')).toBeVisible({ timeout: 10000 });
        await expect(page.locator('#model-name')).not.toBeVisible();
        await expect(page.locator('.error-text')).toBeVisible();
    });
});
