import { defineConfig, devices } from '@playwright/test';

/**
 * E2E config for the AIPage sidebar UI. Serves the built `dist-chrome/` over
 * HTTP and drives it in headless Chromium. Build first with
 * `cargo run -p xtask -- build --target chrome`.
 */
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:4173',
    headless: true,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'bun scripts/serve-dist.ts',
    url: 'http://localhost:4173/sidebar.html',
    reuseExistingServer: !process.env.CI,
    timeout: 20_000,
  },
});
