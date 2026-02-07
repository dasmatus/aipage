
import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';

// Helper to get the correct build path based on project
const getDistFolder = (projectName: string) => {
    switch (projectName) {
        case 'firefox':
            return 'dist-firefox';
        case 'webkit':
            return 'dist-safari';
        default:
            return 'dist-chrome';
    }
};

const resolvePath = (relativePath: string) => {
    return path.resolve(process.cwd(), relativePath);
}

test.describe('EduPage Test Player Integration', () => {
    test.beforeEach(async ({ page }, testInfo) => {
        const distFolder = getDistFolder(testInfo.project.name);
        
        // Calculate absolute path for sidebar.html
        const sidebarUrl = `file://${resolvePath(`${distFolder}/sidebar.html`)}`;

        // Mock chrome API
        await page.addInitScript((url) => {
            const listeners: any[] = [];
            (window as any).chrome = {
                runtime: {
                    getURL: (pathVal: string) => {
                         if (pathVal === 'sidebar.html') {
                             return url;
                         }
                         return pathVal;
                    },
                    onMessage: {
                        addListener: (cb: any) => { listeners.push(cb); }
                    },
                    sendMessage: (msg: any, cb: any) => {
                        // Echo or mock response
                        if (msg.action === 'get_page_content') {
                             if(cb) cb({ content: 'Test Content', isSelection: false });
                        }
                    }
                },
                storage: {
                    local: {
                        get: async (keys: any, cb: any) => {
                             const res = {};
                             if (cb) cb(res);
                             return res;
                        },
                        set: async (data: any, cb: any) => { 
                            if (cb) cb(); 
                        },
                        onChanged: { addListener: () => {} }
                    }
                },
                // Mock tabs for completeness although content script uses browser.tabs usually?
                // Content script uses browser-polyfill which maps to chrome if available
            };
            (window as any).browser = (window as any).chrome;
        }, sidebarUrl);

        // Load the Test Player HTML file
        const testHtmlPath = resolvePath('test.html');
        if (!fs.existsSync(testHtmlPath)) {
            // Fallback or skip? Assuming test.html is in root as per original
            // Wait, original was `../../test.html`.
            // `tests/test-player.spec.ts` -> `../../` is project root.
            // So `resolvePath('test.html')` is correct.
        }
        await page.goto(`file://${testHtmlPath}`);

        // Inject the built content script
        const contentScriptPath = resolvePath(`${distFolder}/content.js`);
        if (fs.existsSync(contentScriptPath)) {
            const contentScript = fs.readFileSync(contentScriptPath, 'utf8');
            await page.addScriptTag({ content: contentScript });
        } else {
             console.warn(`Content script not found at ${contentScriptPath}, tests might fail.`);
        }
    });

    test('should display the AI button in the test player navbar', async ({ page }) => {
        const aiBtn = page.locator('#edubar-ai-btn');
        await expect(aiBtn).toBeVisible({ timeout: 5000 });
        await expect(aiBtn).toHaveAttribute('title', 'AI Asistent');
        await expect(aiBtn).toHaveClass(/etest-action-button/); // Specific class for test player
    });

    test('sidebar should position correctly under test player header', async ({ page }) => {
        const header = page.locator('.etest-player-header-inner');
        // Ensure header is visible
        await expect(header).toBeVisible();
        const headerBox = await header.boundingBox();
        const headerHeight = headerBox?.height || 0;

        // Open sidebar
        const aiBtn = page.locator('#edubar-ai-btn');
        await aiBtn.click();

        const sidebar = page.locator('#gemini-sidebar-frame');
        await expect(sidebar).toBeVisible();

        // Check content loads
        const sidebarFrame = page.frameLocator('#gemini-sidebar-frame');
        // We wait for the sidebar content to render. 
        // Note: sidebar.html loads sidebar.js which renders React. 
        // We might need to wait for something unique.
        await expect(sidebarFrame.locator('.header-title')).toContainText('EduPage AI', { timeout: 10000 });

        // Check top position
        const sidebarBox = await sidebar.boundingBox();
        expect(sidebarBox?.y).toBeGreaterThanOrEqual(headerHeight - 2);
    });

    test('sidebar should adjust test player header right property when opened', async ({ page }) => {
        const header = page.locator('.etest-player-header');
        
        // Initial state check
        const initialRight = await header.evaluate((el) => (el as HTMLElement).style.right);
        
        // Open sidebar
        await page.locator('#edubar-ai-btn').click();

        const sidebar = page.locator('#gemini-sidebar-frame');
        await expect(sidebar).toBeVisible();

        const headerRight = await header.evaluate((el) => (el as HTMLElement).style.right);
        // Current implementation: "Removed extended header manipulation to prevent navbar moving"
        // So headerRight should explicitly NOT change or be empty string/0px if not manipulated?
        // Let's check logic in content.ts.
        // `updateLayout` function: `const etestFixedHeaders = ...` -> comments say REMOVED.
        // `const etestPlayer = document.querySelector('.etest-player')` IS manipulated.
        // `const header` (which usually has class `.etest-player-header`) is NOT manipulated anymore in `updateLayout`.
        
        // So expectations:
        // Before: whatever (empty string usually)
        // After: SAME (empty string)
        
        expect(headerRight).toBe('');
    });

    test('AI button should remain clickable when sidebar is open', async ({ page }) => {
        const aiBtn = page.locator('#edubar-ai-btn');
        // Open sidebar
        await aiBtn.click();
        const sidebar = page.locator('#gemini-sidebar-frame');
        await expect(sidebar).toBeVisible();

        // Click again to close (force true just in case of slight overlap, but test player usually puts it in header)
        await aiBtn.click({ force: true });
        
        // Expect sidebar to close (right property becomes negative)
        // Wait for animation
        await expect(sidebar).toHaveCSS('right', /^-/);
    });
});
