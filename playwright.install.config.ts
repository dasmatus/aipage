import { defineConfig } from '@playwright/test';

/**
 * Extension *install* tests (tests/install). Unlike the e2e suite, these do
 * not serve `dist-chrome` over HTTP: they load the pre-built dists the way a
 * browser would — Chromium as a real unpacked MV2 extension, Firefox via
 * `web-ext lint` plus a temporary headless install when a Firefox binary is
 * available, Safari as a structural check of `dist-safari`.
 *
 * Build everything first: `cargo run -p xtask -- build-all`, then
 * `bun run test:install`.
 */
export default defineConfig({
  testDir: './tests/install',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  // Each spec launches its own browser/process; keep them sequential so the
  // persistent Chromium profile and the Firefox remote-debug port never clash.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  outputDir: 'test-results/install',
  use: {
    headless: true,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'install' }],
});
