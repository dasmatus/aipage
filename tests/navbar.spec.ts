import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';

test.describe('EduPage Navbar Integration', () => {
    test.beforeEach(async ({ page }) => {
        // Mock chrome API before loading script
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

        // Load the EduPage HTML file
        // note: adjusting path to point to the root directory
        const edupagePath = path.resolve(__dirname, '../../edupage.html');
        await page.goto(`file://${edupagePath}`);

        // Inject the content script logic
        // We read the built file to ensure we test what we build
        const contentScriptPath = path.resolve(__dirname, '../dist/content.js');
        const contentScript = fs.readFileSync(contentScriptPath, 'utf8');

        await page.addScriptTag({ content: contentScript });
    });

    test('should display all standard EduPage navbar buttons', async ({ page }) => {
        // 1. Start Button
        await expect(page.locator('#edubarStartButton')).toBeVisible();

        // 2. Chat Button (Using :not to ignore our injected AI button)
        await expect(page.locator('.edubarChatBtn:not(#edubar-ai-btn)')).toBeVisible();

        // 3. Timeline/Notifications Button
        await expect(page.locator('.edubarTimelineBtn')).toBeVisible();

        // 4. Help Button
        await expect(page.locator('#edubarHelpMenuBtn')).toBeVisible();

        // 5. Profile Box/Button
        await expect(page.locator('.edubarProfilebox')).toBeVisible();
    });

    test('should display the injected AI button', async ({ page }) => {
        // The content script should verify the quickmenu exists and inject the button
        await expect(page.locator('#edubar-ai-btn')).toBeVisible();
        await expect(page.locator('#edubar-ai-btn')).toHaveAttribute('title', 'AI Assistant');
    });

    test('sidebar should not obscure navbar buttons when opened', async ({ page }) => {
        // Open sidebar
        await page.click('#edubar-ai-btn');

        // Wait for animation
        await page.waitForTimeout(500);

        // Sidebar iframe should be visible and have correct width
        const sidebar = page.locator('#gemini-sidebar-frame');
        await expect(sidebar).toBeVisible();
        const sidebarBox = await sidebar.boundingBox();
        expect(sidebarBox?.width).toBe(300);

        // Navbar buttons should still be visible (not covered)
        // We check all the buttons the user mentioned
        const buttonsToCheck = [
            '#edubarStartButton',       // Start
            '#edubar-ai-btn',           // AI Button
            '.edubarTimelineBtn',       // Messages/Announcements (Timeline)
            '.edubarChatBtn:not(#edubar-ai-btn)', // Chat
            '#edubarHelpMenuBtn',       // Help
            '.edubarProfilebox'         // User Account
        ];

        for (const selector of buttonsToCheck) {
            const locator = page.locator(selector);
            await expect(locator).toBeVisible();

            // Validate it is not covered by the sidebar
            // We can check if the bounding box right edge is approximately <= viewport width - 300
            const box = await locator.boundingBox();
            const viewportSize = page.viewportSize();

            if (box && viewportSize) {
                // The element should be to the left of the sidebar
                // Sidebar is at right: 0, width: 300. So sidebar starts at viewport.width - 300.
                const sidebarStart = viewportSize.width - 300;
                expect(box.x + box.width).toBeLessThanOrEqual(sidebarStart + 5); // +5 for margin of error/borders
            }
        }
    });
});
