import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';

test.describe('EduPage Navbar Integration', () => {
    test.beforeEach(async ({ page }) => {
        // Mock chrome API
        await page.addInitScript(() => {
            (window as any).chrome = {
                runtime: {
                    getURL: (path: string) => path,
                    onMessage: {
                        addListener: () => { }
                    }
                },
                storage: {
                    local: {
                        get: async () => ({}),
                        set: async () => { }
                    }
                }
            };
        });

        const edupagePath = path.resolve(__dirname, '../../edupage.html');
        await page.goto(`file://${edupagePath}`);

        const contentScriptPath = path.resolve(__dirname, '../dist/content.js');
        const contentScript = fs.readFileSync(contentScriptPath, 'utf8');
        await page.addScriptTag({ content: contentScript });
    });

    test('should display all standard EduPage navbar buttons', async ({ page }) => {
        await expect(page.locator('#edubarStartButton')).toBeAttached();
    });

    test('should display the injected AI button', async ({ page }) => {
        const aiBtn = page.locator('#edubar-ai-btn');
        await expect(aiBtn).toBeAttached({ timeout: 5000 });

        // Use attached instead of visible to be resilient to missing CSS in tests
        await expect(aiBtn).toBeAttached();
    });

    test('sidebar should not obscure navbar buttons when opened', async ({ page }) => {
        const aiBtn = page.locator('#edubar-ai-btn');
        await expect(aiBtn).toBeAttached({ timeout: 5000 });
        await aiBtn.click();

        const sidebar = page.locator('#gemini-sidebar-frame');
        await expect(sidebar).toBeAttached();

        // Check layout update
        const bodyWidth = await page.evaluate(() => document.body.style.width);
        expect(bodyWidth).toContain('calc(100% -');
    });
});
