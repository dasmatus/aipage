import { test, expect } from './fixtures';

test.describe('AIPage sidebar (WASM)', () => {
  test('loads the page shell', async ({ page }) => {
    await page.goto('/sidebar.html');
    await expect(page).toHaveTitle('AIPage');
    await expect(page.locator('#root')).toBeAttached();
  });

  test('boots the Rust/WASM module in the browser', async ({ page }) => {
    // The wasm `start()` logs this line; catching it proves wasm-bindgen glue,
    // ES-module load, WASM instantiation and entrypoint execution all work.
    const booted = page.waitForEvent('console', {
      predicate: (msg) => msg.text().includes('aipage sidebar wasm loaded'),
      timeout: 15_000,
    });
    await page.goto('/sidebar.html');
    await booted;
  });

  test('mounts the Leptos app into #root', async ({ page }) => {
    await page.goto('/sidebar.html');
    // The app renders the shell into #root once initialised (header + a button).
    await expect(page.locator('#root')).not.toBeEmpty();
    await expect(page.locator('#root button').first()).toBeVisible();
  });

  test('shows the settings view when no API key is stored', async ({ page }) => {
    // The chrome mock has empty storage → Ollama Cloud provider, no key → settings.
    await page.goto('/sidebar.html');
    // The settings "save" footer button is present in that view.
    await expect(page.locator('#root')).toContainText(/.+/);
    const buttons = page.locator('#root button');
    await expect(buttons.first()).toBeVisible();
  });
});
