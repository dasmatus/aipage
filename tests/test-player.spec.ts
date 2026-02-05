import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';

test.describe('EduPage Test Player Integration', () => {
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
                        get: (keys: any, cb: any) => cb({}),
                        set: (data: any, cb: any) => { if (cb) cb(); }
                    }
                }
            };
        });

        // Load the Test Player HTML file
        const testHtmlPath = path.resolve(__dirname, '../../test.html');
        await page.goto(`file://${testHtmlPath}`);

        // Inject the built content script
        const contentScriptPath = path.resolve(__dirname, '../dist/content.js');
        const contentScript = fs.readFileSync(contentScriptPath, 'utf8');
        await page.addScriptTag({ content: contentScript });
    });

    test('should display the AI button in the test player navbar', async ({ page }) => {
        const aiBtn = page.locator('#edubar-ai-btn');
        await expect(aiBtn).toBeVisible();
        await expect(aiBtn).toHaveAttribute('title', 'AI Asistent');

        // In test player, it should have the specific action button class
        await expect(aiBtn).toHaveClass(/etest-action-button/);
    });

    test('sidebar should position correctly under test player header', async ({ page }) => {
        // Get header height
        const header = page.locator('.etest-player-header-inner');
        const headerBox = await header.boundingBox();
        const headerHeight = headerBox?.height || 0;

        // Open sidebar
        const aiBtn = page.locator('#edubar-ai-btn');
        await aiBtn.click();

        const sidebar = page.locator('#gemini-sidebar-frame');
        await expect(sidebar).toBeVisible();

        // Check top position (allow 1px difference for sub-pixel variations)
        const sidebarBox = await sidebar.boundingBox();
        expect(Math.abs((sidebarBox?.y || 0) - headerHeight)).toBeLessThanOrEqual(1);
    });

    test('resizing should adjust test player header width', async ({ page }) => {
        // Open sidebar
        await page.locator('#edubar-ai-btn').click();

        const resizer = page.locator('#gemini-sidebar-resizer');
        await expect(resizer).toBeVisible();

        const header = page.locator('.etest-player-header');
        const initialHeaderBox = await header.boundingBox();

        // Drag resizer to the left
        const resizerBox = await resizer.boundingBox();
        if (resizerBox) {
            await page.mouse.move(resizerBox.x + resizerBox.width / 2, resizerBox.y + 100);
            await page.mouse.down();
            await page.mouse.move(resizerBox.x - 100, resizerBox.y + 100);
            await page.mouse.up();
        }

        const newHeaderBox = await header.boundingBox();
        if (initialHeaderBox && newHeaderBox) {
            expect(newHeaderBox.width).toBeLessThan(initialHeaderBox.width);
        }
    });
});
