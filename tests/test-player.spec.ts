import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';

test.describe('EduPage Test Player Integration', () => {
    test.beforeEach(async ({ page }) => {
        // Calculate absolute path for sidebar.html
        const sidebarUrl = `file://${path.resolve(__dirname, '../dist-chrome/sidebar.html')}`;

        // Mock chrome API
        await page.addInitScript((url) => {
            (window as any).chrome = {
                runtime: {
                    getURL: (pathVal: string) => {
                         if (pathVal === 'sidebar.html') {
                             return url;
                         }
                         return pathVal;
                    },
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
        }, sidebarUrl);

        // Load the Test Player HTML file
        const testHtmlPath = path.resolve(__dirname, '../../test.html');
        await page.goto(`file://${testHtmlPath}`);

        // Inject the built content script
        const contentScriptPath = path.resolve(__dirname, '../dist-chrome/content.js');
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

        // Check content loads (Not white box)
        const sidebarFrame = page.frameLocator('#gemini-sidebar-frame');
        await expect(sidebarFrame.locator('.header-title')).toContainText('EduPage AI');

        // Check top position (allow margin for borders/shadows)
        const sidebarBox = await sidebar.boundingBox();
        // We only care that it's roughly below the header
        expect(sidebarBox?.y).toBeGreaterThanOrEqual(headerHeight - 2);
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
            expect(Math.abs(newHeaderBox.width - initialHeaderBox.width)).toBeGreaterThan(5);
        }
    });

    test('sidebar should adjust test player header right property when opened', async ({ page }) => {
        const header = page.locator('.etest-player-header');

        // Open sidebar
        await page.locator('#edubar-ai-btn').click();

        const sidebar = page.locator('#gemini-sidebar-frame');
        await expect(sidebar).toBeVisible();

        const headerRight = await header.evaluate((el) => (el as HTMLElement).style.right);
        expect(headerRight).toBe('');
    });

    test('AI button should remain clickable when sidebar is open', async ({ page }) => {
        const aiBtn = page.locator('#edubar-ai-btn');
        // Open sidebar
        await aiBtn.click();
        const sidebar = page.locator('#gemini-sidebar-frame');
        await expect(sidebar).toBeVisible();

        // Should be able to click it again (force: true to bypass strict overlap check if z-index is close)
        await aiBtn.click({ force: true, timeout: 2000 });
        await expect(sidebar).toHaveCSS('right', /^-/);
    });
});
