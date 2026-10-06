import { test, expect, chromium, type BrowserContext, type CDPSession, type Page } from '@playwright/test';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { CHROMIUM_MV2_ARGS, ROOT, readManifest, requireDist } from './helpers';

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

/** `dist-web/aipage-web.json` + the listed files, base64-encoded for `page.evaluate`. */
type WebBundle = {
  version: string;
  sha: string;
  built_at: string;
  files: Record<string, { sha256: string; size: number }>;
  contents: Record<string, string>;
};

function readWebBundle(): WebBundle | null {
  const dir = resolve(ROOT, 'dist-web');
  const manifestPath = resolve(dir, 'aipage-web.json');
  if (!existsSync(manifestPath)) return null;
  const m = JSON.parse(readFileSync(manifestPath, 'utf8')) as Omit<WebBundle, 'contents'>;
  const contents: Record<string, string> = {};
  for (const name of Object.keys(m.files)) contents[name] = readFileSync(resolve(dir, name)).toString('base64');
  return { ...m, contents };
}

/**
 * Seed the extension origin's IndexedDB exactly as the background's
 * `ui_bundle::sync` does (database `aipage-ui-bundle`, store `ui-bundle`
 * keyed by `name`: one record per file + the `meta` record) and switch the
 * `ui_bundle_update_enabled` setting on. Runs inside `sidebar.html`, which
 * shares the origin with the background page.
 */
async function seedUiBundle(page: Page, bundle: WebBundle, corruptName?: string) {
  await page.evaluate(
    async ({ bundle, corruptName }) => {
      const toBytes = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const names = Object.keys(bundle.files);
      const glue = names.find((n) => /^sidebar\.[0-9a-f]+\.js$/.test(n))!;
      const wasm = names.find((n) => /^sidebar_bg\.[0-9a-f]+\.wasm$/.test(n))!;
      const css = names.filter((n) => n.endsWith('.css'));
      const type = (n: string) => (n.endsWith('.js') ? 'text/javascript' : n.endsWith('.wasm') ? 'application/wasm' : 'text/css');
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open('aipage-ui-bundle', 1);
        req.onupgradeneeded = () => req.result.createObjectStore('ui-bundle', { keyPath: 'name' });
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      const tx = db.transaction('ui-bundle', 'readwrite');
      const store = tx.objectStore('ui-bundle');
      store.clear();
      for (const name of [glue, wasm, ...css]) {
        const bytes = toBytes(bundle.contents[name]);
        if (name === corruptName) bytes[0] ^= 0xff;
        store.put({ name, contentType: type(name), sha256: bundle.files[name].sha256, size: bytes.length, bytes: bytes.buffer });
      }
      store.put({
        name: 'meta',
        version: bundle.version,
        sha: bundle.sha,
        channel: 'stable',
        builtAt: bundle.built_at,
        installedAt: new Date().toISOString(),
        glue,
        wasm,
        css,
        files: bundle.files,
      });
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
      const { chrome } = globalThis as unknown as { chrome: { storage: { local: { set: (items: object, cb: () => void) => void } } } };
      await new Promise<void>((resolve) => chrome.storage.local.set({ ui_bundle_update_enabled: true }, () => resolve()));
    },
    { bundle, corruptName: corruptName ?? null },
  );
}

/** Keys left in the `ui-bundle` store (empty array when the store was cleared or never created). */
async function uiBundleKeys(page: Page): Promise<string[]> {
  return page.evaluate(
    () =>
      new Promise<string[]>((resolve) => {
        const req = indexedDB.open('aipage-ui-bundle');
        req.onupgradeneeded = () => req.transaction?.abort();
        req.onerror = () => resolve([]);
        req.onsuccess = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains('ui-bundle')) return resolve([]);
          const keys = db.transaction('ui-bundle').objectStore('ui-bundle').getAllKeys();
          keys.onsuccess = () => resolve(keys.result.map(String));
          keys.onerror = () => resolve([]);
        };
      }),
  );
}

/** Open `sidebar.html` collecting boot signals, console errors, page errors and CSP violations. */
async function openSidebar(context: BrowserContext, extensionId: string) {
  const page = await context.newPage();
  const consoleErrors: string[] = [];
  const consoleWarnings: string[] = [];
  const consoleInfo: string[] = [];
  const pageErrors: string[] = [];
  page.on('console', (msg) => {
    const text = msg.text();
    if (msg.type() === 'warning') consoleWarnings.push(text);
    if (msg.type() === 'info' || msg.type() === 'log') consoleInfo.push(text);
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
  const cspViolations = () => page.evaluate(() => (window as unknown as { __aipageCspViolations: string[] }).__aipageCspViolations);
  return { page, consoleErrors, consoleWarnings, consoleInfo, pageErrors, cspViolations };
}

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
  let extensionId = '';

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
    extensionId = new URL(backgrounds[0].url).host;
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

  /**
   * The self-updating sidebar: `sidebar_loader.js` finds the bundle the
   * background stored in IndexedDB, imports the glue as a `blob:` module
   * (allowed by `script-src … blob:` in the MV2 manifest), instantiates the
   * wasm from the stored bytes and attaches the stylesheets as `blob:` links.
   * Seeded with the freshly built `dist-web` (same version as the extension,
   * so the loader accepts it); the real download path cannot run here as no
   * GitHub release exists yet.
   */
  test('boots the UI bundle seeded in IndexedDB through blob: imports under the extension CSP', async () => {
    const bundle = readWebBundle();
    test.skip(!bundle, 'dist-web/aipage-web.json not built (cargo run -p xtask -- build --target web)');
    expect(extensionId, 'extension id from the previous test').toMatch(/^[a-p]{32}$/);

    // Seed from a first sidebar page (same origin as the background page).
    const seed = await context.newPage();
    await seed.goto(`chrome-extension://${extensionId}/sidebar.html`);
    await seedUiBundle(seed, bundle!);
    await seed.close();

    const { page, consoleErrors, consoleInfo, pageErrors, cspViolations } = await openSidebar(context, extensionId);
    await expect
      .poll(() => consoleInfo.some((t) => t.includes('loaded from the downloaded GitHub bundle')), {
        message: 'loader never reported booting the downloaded bundle',
        timeout: 30_000,
      })
      .toBe(true);
    expect(consoleInfo.some((t) => t.includes('aipage sidebar wasm loaded'))).toBe(true);
    await expect(page.locator('#root button').first()).toBeVisible();

    const blobState = await page.evaluate(() => ({
      blobLinks: Array.from(document.querySelectorAll('link[rel="stylesheet"][data-aipage-bundle]')).map((l) => (l as HTMLLinkElement).href),
      bundledDisabled: Array.from(document.querySelectorAll('link[rel="stylesheet"]:not([data-aipage-bundle])'))
        .filter((l) => !/^https?:/.test((l as HTMLLinkElement).getAttribute('href') || ''))
        .every((l) => (l as HTMLLinkElement).disabled),
    }));
    expect(blobState.blobLinks.length).toBeGreaterThan(0);
    for (const href of blobState.blobLinks) expect(href).toMatch(/^blob:chrome-extension:\/\//);
    expect(blobState.bundledDisabled, 'bundled stylesheets disabled in favour of the downloaded ones').toBe(true);

    await page.waitForTimeout(500);
    expect(await cspViolations(), 'CSP violations while booting the blob: bundle').toEqual([]);
    expect(pageErrors, 'uncaught page errors').toEqual([]);
    expect(consoleErrors, 'console errors').toEqual([]);
    expect((await uiBundleKeys(page)).sort(), 'bundle kept in IndexedDB after a successful boot').toContain('meta');
    await page.close();
  });

  test('falls back to the bundled UI and clears a bundle whose hash check fails', async () => {
    const bundle = readWebBundle();
    test.skip(!bundle, 'dist-web/aipage-web.json not built (cargo run -p xtask -- build --target web)');
    expect(extensionId).toMatch(/^[a-p]{32}$/);
    const glue = Object.keys(bundle!.files).find((n) => /^sidebar\.[0-9a-f]+\.js$/.test(n))!;

    const seed = await context.newPage();
    await seed.goto(`chrome-extension://${extensionId}/sidebar.html`);
    await seedUiBundle(seed, bundle!, glue);
    await seed.close();

    const { page, consoleErrors, consoleWarnings, consoleInfo, pageErrors, cspViolations } = await openSidebar(context, extensionId);
    await expect
      .poll(() => consoleInfo.some((t) => t.includes('aipage sidebar wasm loaded')), { timeout: 30_000 })
      .toBe(true);
    await expect(page.locator('#root button').first()).toBeVisible();
    expect(consoleWarnings.some((t) => t.includes('downloaded UI bundle unusable') && t.includes('sha256')), 'one warning naming the hash failure').toBe(true);
    expect(consoleInfo.some((t) => t.includes('loaded from the downloaded GitHub bundle')), 'the corrupt bundle must not boot').toBe(false);
    await page.waitForTimeout(500);
    expect(await cspViolations()).toEqual([]);
    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
    expect(await uiBundleKeys(page), 'the broken bundle is cleared').toEqual([]);

    // Leave the profile as the first test found it.
    await page.evaluate(() => {
      const { chrome } = globalThis as unknown as { chrome: { storage: { local: { remove: (key: string, cb: () => void) => void } } } };
      return new Promise<void>((resolve) => chrome.storage.local.remove('ui_bundle_update_enabled', () => resolve()));
    });
    await page.close();
  });
});
