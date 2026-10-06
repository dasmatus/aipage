import { test, expect, chromium, type BrowserContext, type CDPSession, type Page } from '@playwright/test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CHROMIUM_MV2_ARGS, readManifest, requireDist } from './helpers';

/**
 * Loads `dist-chrome` as a real unpacked extension in headless Chromium (new
 * headless mode via the full `chromium` channel; the headless shell cannot
 * load extensions) and proves the extension actually installs and boots:
 *
 *  - the MV2 background (event) page starts — found through CDP
 *    `Target.getTargets`, because Playwright ≥ 1.5x no longer attaches to
 *    `background_page` targets (`context.backgroundPages()` stays empty);
 *  - `chrome-extension://<id>/sidebar.html` loads, the sidebar WASM
 *    instantiates and Leptos renders into `#root`;
 *  - the background WASM's `runtime.onMessage` handler answers a round-trip;
 *  - no page errors, no CSP violations and no extension-origin console errors.
 *
 * Set `CHROMIUM_EXECUTABLE=/path/to/chrome` to use a specific binary instead
 * of Playwright's `chromium` channel.
 *
 * MV2 support: Chromium 153 (Playwright 1.63's bundled build) refuses MV2
 * extensions outright — the `ExtensionManifestV2*` features, the
 * `AllowLegacyMV2Extensions` feature and the `ExtensionManifestV2Availability`
 * policy no longer exist in that binary, while MV3 extensions still load. The
 * last verified build that honours `CHROMIUM_MV2_ARGS` is Chromium 141
 * (Playwright 1.56, build 1194); CI pins that one via `CHROMIUM_EXECUTABLE`.
 */

type BackgroundTarget = { targetId: string; url: string; type: string };

async function findBackgroundTarget(cdp: CDPSession, timeoutMs: number): Promise<BackgroundTarget[]> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const { targetInfos } = await cdp.send('Target.getTargets');
    const bg = (targetInfos as BackgroundTarget[]).filter(
      (t) => t.type === 'background_page' && t.url.startsWith('chrome-extension://'),
    );
    if (bg.length > 0 || Date.now() > deadline) return bg;
    await new Promise((r) => setTimeout(r, 250));
  }
}

test.describe('Chromium: unpacked MV2 install', () => {
  let userDataDir: string;
  let context: BrowserContext;

  test.beforeAll(async () => {
    const dist = requireDist('chrome');
    userDataDir = mkdtempSync(join(tmpdir(), 'aipage-install-'));
    context = await chromium.launchPersistentContext(userDataDir, {
      channel: process.env.CHROMIUM_EXECUTABLE ? undefined : 'chromium',
      executablePath: process.env.CHROMIUM_EXECUTABLE || undefined,
      headless: true,
      args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`, ...CHROMIUM_MV2_ARGS],
    });
  });

  test.afterAll(async () => {
    await context?.close();
    if (userDataDir) rmSync(userDataDir, { recursive: true, force: true });
  });

  test('installs, starts its background page, boots both WASM modules and renders the sidebar', async () => {
    const manifest = readManifest(requireDist('chrome'));

    // --- background page / extension id -------------------------------------
    const probe = await context.newPage();
    const cdp = await context.newCDPSession(probe);
    const backgrounds = await findBackgroundTarget(cdp, 20_000);
    expect(
      backgrounds.length,
      'no chrome-extension:// background_page target: the MV2 extension did not load (MV2 flags?) or its event page did not start',
    ).toBe(1);
    const extensionId = new URL(backgrounds[0].url).host;
    expect(extensionId).toMatch(/^[a-p]{32}$/);
    expect(backgrounds[0].url).toBe(`chrome-extension://${extensionId}/_generated_background_page.html`);

    // --- chrome://extensions-internals: installed, enabled, MV2 ------------
    await probe.goto('chrome://extensions-internals/');
    const internals = await probe.evaluate(() => {
      try {
        return JSON.parse(document.body.innerText) as {
          id: string;
          name: string;
          manifest_version?: number;
          location?: string;
          disable_reasons?: unknown[];
        }[];
      } catch {
        return null;
      }
    });
    expect(internals, 'chrome://extensions-internals did not return JSON').not.toBeNull();
    const entry = internals!.find((e) => e.id === extensionId);
    expect(entry, `extension ${extensionId} missing from chrome://extensions-internals`).toBeDefined();
    expect(entry!.name).toBe(manifest.name);
    expect(entry!.manifest_version).toBe(2);
    expect(entry!.location).toBe('COMMAND_LINE');
    expect(entry!.disable_reasons ?? []).toEqual([]);
    await probe.close();

    // --- sidebar.html in the extension origin -------------------------------
    const page: Page = await context.newPage();
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    let wasmBooted = false;
    page.on('console', (msg) => {
      const text = msg.text();
      if (text.includes('aipage sidebar wasm loaded')) wasmBooted = true;
      if (msg.type() !== 'error') return;
      const from = msg.location()?.url ?? '';
      // Remote resources (e.g. the Google Fonts stylesheet) may be unreachable
      // in a sandbox; only failures from the extension origin are ours.
      if (/^https?:/.test(from) && /Failed to load resource/.test(text)) return;
      consoleErrors.push(`${text} (${from})`);
    });
    page.on('pageerror', (err) => pageErrors.push(err.message));
    await page.addInitScript(() => {
      const w = window as unknown as { __aipageCspViolations: string[] };
      w.__aipageCspViolations = [];
      document.addEventListener('securitypolicyviolation', (e) => {
        w.__aipageCspViolations.push(`${e.violatedDirective} blocked ${e.blockedURI} at ${e.sourceFile}:${e.lineNumber}`);
      });
    });

    await page.goto(`chrome-extension://${extensionId}/sidebar.html#initials=CI`);
    await expect(page).toHaveTitle('AIPage');
    await expect.poll(() => wasmBooted, { message: 'sidebar wasm start() never logged', timeout: 30_000 }).toBe(true);
    await expect(page.locator('#root')).not.toBeEmpty();
    await expect(page.locator('#root button').first()).toBeVisible();

    // --- background WASM round-trip ----------------------------------------
    // `proxy_fetch` without a URL is answered synchronously-ish by the
    // background's Rust handler with {ok:false, error:"Missing url"}: a reply
    // proves the background WASM instantiated and registered onMessage.
    const reply = await page.evaluate(
      () =>
        new Promise<unknown>((resolve, reject) => {
          type Runtime = {
            sendMessage: (msg: unknown, cb: (r: unknown) => void) => void;
            lastError?: { message?: string };
          };
          const runtime = (globalThis as unknown as { chrome: { runtime: Runtime } }).chrome.runtime;
          const timer = setTimeout(() => reject(new Error('no reply from background within 10s')), 10_000);
          runtime.sendMessage({ action: 'proxy_fetch' }, (r: unknown) => {
            clearTimeout(timer);
            if (runtime.lastError) reject(new Error(runtime.lastError.message));
            else resolve(r);
          });
        }),
    );
    expect(reply).toEqual({ ok: false, error: 'Missing url' });

    // --- hygiene --------------------------------------------------------------
    await page.waitForTimeout(500);
    const csp = await page.evaluate(() => (window as unknown as { __aipageCspViolations: string[] }).__aipageCspViolations);
    expect(csp, 'CSP violations in sidebar.html').toEqual([]);
    expect(pageErrors, 'uncaught page errors in sidebar.html').toEqual([]);
    expect(consoleErrors, 'console errors in sidebar.html').toEqual([]);
    await page.close();
  });
});
