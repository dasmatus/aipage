import { test, expect } from '@playwright/test';

// Mock chrome for tests if needed or just ignore TS error
declare const chrome: any;

test.describe('Language Localization', () => {
    test.beforeEach(async ({ page, context }) => {
        // Get extension ID from service worker
        let extensionId = '';
        const worker = context.serviceWorkers()[0];
        if (worker) {
            extensionId = worker.url().split('/')[2];
        }

        if (extensionId) {
            await page.goto(`chrome-extension://${extensionId}/src/sidebar/sidebar.html`);
        } else {
            // Fallback: This might fail if extension is not loaded, but gives a clear error
            // Check if we are already on the page?
            if (page.url() === 'about:blank') {
                 // Try to load a dummy page to init context?
            }
        }
        
        // Ensure we are in settings view or can get there
        
        // Ensure we are in settings view or can get there
        // If settings button is visible, click it (meaning we are in chat view)
        const settingsBtn = await page.locator('#settings-btn');
        if (await settingsBtn.isVisible()) {
             await settingsBtn.click();
        }
        
        // Wait for settings to load
        await page.waitForSelector('#language-select', { timeout: 5000 });
    });

    test('language dropdown should be visible in settings', async ({ page }) => {
        const languageSelect = await page.locator('#language-select');
        await expect(languageSelect).toBeVisible();
        
        // Verify all language options are present
        const options = await page.locator('#language-select option').allTextContents();
        expect(options).toContain('Slovenčina');
        expect(options).toContain('English');
        expect(options).toContain('Čeština');
        expect(options).toContain('Deutsch');
        expect(options).toContain('Magyar');
    });

    test('default language should be Slovak', async ({ page }) => {
        const languageSelect = await page.locator('#language-select');
        const selectedValue = await languageSelect.inputValue();
        expect(selectedValue).toBe('sk');
        
        // Verify Slovak text is displayed
        const settingsTitle = await page.locator('h2').first();
        await expect(settingsTitle).toHaveText('Vyžaduje sa nastavenie');
    });

    test('changing language to English should update UI', async ({ page }) => {
        // Change to English
        await page.selectOption('#language-select', 'en');
        
        // Wait for re-render
        await page.waitForTimeout(500);
        
        // Verify English text appears
        const settingsTitle = await page.locator('h2').first();
        await expect(settingsTitle).toHaveText('Setup Required');
        
        const aiProviderLabel = await page.locator('label').filter({ hasText: /AI Provider|KI-Anbieter|AI Poskytovateľ/ }).first();
        await expect(aiProviderLabel).toHaveText('AI Provider');
        
        const saveButton = await page.locator('#save-key-btn');
        await expect(saveButton).toHaveText('Save Key');
    });

    test('changing language to German should update UI', async ({ page }) => {
        // Change to German
        await page.selectOption('#language-select', 'de');
        
        // Wait for re-render
        await page.waitForTimeout(500);
        
        // Verify German text appears
        const settingsTitle = await page.locator('h2').first();
        await expect(settingsTitle).toHaveText('Einrichtung erforderlich');
        
        const saveButton = await page.locator('#save-key-btn');
        await expect(saveButton).toHaveText('Schlüssel Speichern');
    });

    test('changing language to Czech should update UI', async ({ page }) => {
        // Change to Czech
        await page.selectOption('#language-select', 'cs');
        
        // Wait for re-render
        await page.waitForTimeout(500);
        
        // Verify Czech text appears
        const settingsTitle = await page.locator('h2').first();
        await expect(settingsTitle).toHaveText('Vyžadováno nastavení');
        
        const saveButton = await page.locator('#save-key-btn');
        await expect(saveButton).toHaveText('Uložit Klíč');
    });

    test('changing language to Hungarian should update UI', async ({ page }) => {
        // Change to Hungarian
        await page.selectOption('#language-select', 'hu');
        
        // Wait for re-render
        await page.waitForTimeout(500);
        
        // Verify Hungarian text appears
        const settingsTitle = await page.locator('h2').first();
        await expect(settingsTitle).toHaveText('Beállítás szükséges');
        
        const saveButton = await page.locator('#save-key-btn');
        await expect(saveButton).toHaveText('Kulcs Mentése');
    });

    test('provider names should be localized', async ({ page }) => {
        // Default Slovak
        let geminiOption = await page.locator('#provider-select option[value="gemini"]').textContent();
        expect(geminiOption).toBe('Google Gemini');
        
        let ollamaOption = await page.locator('#provider-select option[value="ollama"]').textContent();
        expect(ollamaOption).toContain('Lokálne');
        
        // Switch to English
        await page.selectOption('#language-select', 'en');
        await page.waitForTimeout(500);
        
        ollamaOption = await page.locator('#provider-select option[value="ollama"]').textContent();
        expect(ollamaOption).toContain('Local');
        
        // Switch to German
        await page.selectOption('#language-select', 'de');
        await page.waitForTimeout(500);
        
        ollamaOption = await page.locator('#provider-select option[value="ollama"]').textContent();
        expect(ollamaOption).toContain('Lokal');
    });

    test('instructions should be localized per provider', async ({ page }) => {
        // Select Gemini provider
        await page.selectOption('#provider-select', 'gemini');
        await page.waitForTimeout(300);
        
        // Check Slovak instructions (default)
        const instructionsTitle = await page.locator('.provider-instructions[data-provider="gemini"] h3').textContent();
        expect(instructionsTitle).toContain('Ako získať Gemini API kľúč:');
        
        // Switch to English
        await page.selectOption('#language-select', 'en');
        await page.waitForTimeout(500);
        
        const instructionsTitleEn = await page.locator('.provider-instructions[data-provider="gemini"] h3').textContent();
        expect(instructionsTitleEn).toContain('How to get a Gemini API key:');
    });

    test('all labels and hints should be localized', async ({ page }) => {
        // Default Slovak
        const apiKeyLabel = await page.locator('label').filter({ hasText: /API/ }).first().textContent();
        expect(apiKeyLabel).toBe('API kľúč');
        
        const hint = await page.locator('.hint').textContent();
        expect(hint).toContain('uložený na vašom zariadení');
        
        // Switch to English
        await page.selectOption('#language-select', 'en');
        await page.waitForTimeout(500);
        
        const apiKeyLabelEn = await page.locator('label').filter({ hasText: /API/ }).first().textContent();
        expect(apiKeyLabelEn).toBe('API Key');
        
        const hintEn = await page.locator('.hint').textContent();
        expect(hintEn).toContain('stored on your device');
    });

    test('local provider settings should be localized', async ({ page }) => {
        // Switch to Ollama (local provider)
        await page.selectOption('#provider-select', 'ollama');
        await page.waitForTimeout(300);
        
        // Verify local settings appear with Slovak labels (default)
        const baseUrlLabel = await page.locator('#local-settings label').first().textContent();
        expect(baseUrlLabel).toBe('Základná URL');
        
        const modelLabel = await page.locator('#local-settings label').nth(1).textContent();
        expect(modelLabel).toBe('Model');
        
        // Switch to English
        await page.selectOption('#language-select', 'en');
        await page.waitForTimeout(500);
        
        const baseUrlLabelEn = await page.locator('#local-settings label').first().textContent();
        expect(baseUrlLabelEn).toBe('Base URL');
        
        const modelLabelEn = await page.locator('#local-settings label').nth(1).textContent();
        expect(modelLabelEn).toBe('Model');
    });

    test('language preference should persist', async ({ page, context }) => {
        // Change to English
        await page.selectOption('#language-select', 'en');
        await page.waitForTimeout(500);
        
        // Verify storage
        const storage = await page.evaluate(() => {
            return chrome.storage.local.get('language');
        });
        expect(storage.language).toBe('en');
        
        // Reload page
        await page.reload();
        await page.waitForSelector('#language-select');
        
        // Verify language is still English
        const selectedValue = await page.locator('#language-select').inputValue();
        expect(selectedValue).toBe('en');
        
        const settingsTitle = await page.locator('h2').first();
        await expect(settingsTitle).toHaveText('Setup Required');
    });

    test('input area should be localized', async ({ page }) => {
        // Close settings to see chat
        // Look for the back button
        await page.locator('.secondary-btn').filter({ hasText: /Späť|Back|Zpět|Zurück|Vissza/ }).click();
        
        // Default Slovak 
        
        const input = await page.locator('#chat-input');
        await expect(input).toHaveAttribute('placeholder', 'Spýtaj sa na čokoľvek...');
        
        const scanBtn = await page.locator('#scan-page-btn');
        await expect(scanBtn).toHaveAttribute('title', 'Analyzovať stránku');
        
        // Go back to settings
        await page.locator('#settings-btn').click();
        
        // Change to English
        await page.selectOption('#language-select', 'en');
        // Wait for state update
        await page.waitForTimeout(500);
        
        // Close settings
        await page.locator('.secondary-btn').filter({ hasText: 'Back to Chat' }).click();
        
        // Verify English
        await expect(input).toHaveAttribute('placeholder', 'Ask anything...');
        await expect(scanBtn).toHaveAttribute('title', 'Analyze Page');
    });
    test('theme names should be localized', async ({ page }) => {
        const languageSelect = await page.locator('#language-select');
        
        // Slovak (Default)
        // Find the theme select
        const themeSelect = await page.locator('select').nth(1); // Assuming 2nd select is theme
        let options = await themeSelect.locator('option').allTextContents();
        expect(options).toContain('EduPage (Predvolená)');
        expect(options).toContain('Monochromatická');

        // English
        await languageSelect.selectOption('en');
        await page.waitForTimeout(500);
        options = await themeSelect.locator('option').allTextContents();
        expect(options).toContain('EduPage (Default)');
        expect(options).toContain('Monochromatic');

        // German
        await languageSelect.selectOption('de');
        await page.waitForTimeout(500);
        options = await themeSelect.locator('option').allTextContents();
        expect(options).toContain('EduPage (Standard)');
        expect(options).toContain('Monochrom');
    });
});
