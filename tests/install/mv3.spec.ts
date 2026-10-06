import { test, expect, chromium, type BrowserContext, type CDPSession, type Page } from '@playwright/test';
import { createServer, type Server } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { CHROMIUM_MV2_ARGS, distDir, readManifest, requireDist } from './helpers';

/**
 * EXPERIMENTAL — real unpacked install of the Manifest V3 prototype
 * (`dist-chrome-mv3`, `cargo run -p xtask -- build --target chrome-mv3`).
 * Opt-in: skipped unless `AIPAGE_MV3=1` (`bun run test:install:mv3`), so it
 * is not part of the default install gate. See docs/mv3-feasibility.md.
 *
 * Proves, on the Chromium build picked by `CHROMIUM_EXECUTABLE` (default:
 * Playwright's `chromium` channel), that:
 *
 *  1. the extension installs with no MV2 flags and its background
 *     *service worker* starts (CDP `Target.getTargets`, type `service_worker`);
 *  2. `chrome://extensions-internals` lists it enabled as MV3;
 *  3. `chrome-extension://<id>/sidebar.html` boots the sidebar WASM and renders
 *     the Leptos UI under the MV3 extension-pages CSP (`'wasm-unsafe-eval'`,
 *     no `'unsafe-eval'`), with no CSP violation / page error / console error;
 *  4. the background WASM answers `proxy_fetch` (both the "Missing url"
 *     validation reply and a real round-trip to a local HTTP server, i.e. a
 *     `fetch` from inside the service worker);
 *  5. the content script injected into an edupage.org page (served by a
 *     Playwright route, so no network) fetches and instantiates
 *     `content_bg.wasm` through `web_accessible_resources`;
 *  6. after the service worker is stopped, a `runtime.sendMessage` wakes it
 *     and is still answered: the loader's synchronous listener shim replays
 *     the event that arrived before the WASM finished instantiating.
 *
 * A second describe loads the shipped MV2 `dist-chrome` on the *same* binary
 * (with the MV2 flags) and records whether it installs; set
 * `AIPAGE_MV2_EXPECT=load|reject` to assert it. This documents, per browser
 * build, that MV3 loads where MV2 does not.
 *
 * `AIPAGE_MV3_DIST=/path` points the MV3 describe at another unpacked dir
 * (used for control experiments such as a loader without the listener shim).
 */

const ENABLED = process.env.AIPAGE_MV3 === '1';

type TargetInfo = { targetId: string; url: string; type: string };

async function findTargets(cdp: CDPSession, type: string, timeoutMs: number): Promise<TargetInfo[]> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const { targetInfos } = await cdp.send('Target.getTargets');
    const hits = (targetInfos as TargetInfo[]).filter((t) => t.type === type && t.url.startsWith('chrome-extension://'));
    if (hits.length > 0 || Date.now() > deadline) return hits;
    await new Promise((r) => setTimeout(r, 250));
  }
}

type Internals = { id: string; name: string; manifest_version?: number; location?: string; disable_reasons?: unknown[] }[];

async function readInternals(context: BrowserContext): Promise<Internals | null> {
  const page = await context.newPage();
  try {
    await page.goto('chrome://extensions-internals/');
    return await page.evaluate(() => {
      try {
        return JSON.parse(document.body.innerText) as Internals;
      } catch {
        return null;
      }
    });
  } finally {
    await page.close();
  }
}

function launch(dist: string, userDataDir: string, extraArgs: string[] = []) {
  return chromium.launchPersistentContext(userDataDir, {
    channel: process.env.CHROMIUM_EXECUTABLE ? undefined : 'chromium',
    executablePath: process.env.CHROMIUM_EXECUTABLE || undefined,
    headless: true,
    args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`, ...extraArgs],
  });
}

/** `chrome.runtime.sendMessage` from an extension page, awaited for its reply. */
function sendMessage(page: Page, message: unknown, timeoutMs = 15_000): Promise<unknown> {
  return page.evaluate(
    ([msg, ms]) =>
      new Promise<unknown>((resolve, reject) => {
        type Runtime = {
          sendMessage: (msg: unknown, cb: (r: unknown) => void) => void;
          lastError?: { message?: string };
        };
        const runtime = (globalThis as unknown as { chrome: { runtime: Runtime } }).chrome.runtime;
        const timer = setTimeout(() => reject(new Error(`no reply from background within ${ms}ms`)), ms as number);
        runtime.sendMessage(msg, (r: unknown) => {
          clearTimeout(timer);
          if (runtime.lastError) reject(new Error(runtime.lastError.message));
          else resolve(r);
        });
      }),
    [message, timeoutMs] as const,
  );
}

test.describe('Chromium: unpacked MV3 install (experimental prototype)', () => {
  test.skip(!ENABLED, 'experimental MV3 prototype; set AIPAGE_MV3=1 (bun run test:install:mv3)');

  let userDataDir: string;
  let context: BrowserContext;
  let server: Server;
  let serverUrl: string;

  const mv3Dist = () => process.env.AIPAGE_MV3_DIST || requireDist('chrome-mv3');

  test.beforeAll(async () => {
    const dist = mv3Dist();
    userDataDir = mkdtempSync(join(tmpdir(), 'aipage-mv3-install-'));
    // Local origin for the proxy round-trip (`http://127.0.0.1/*` is a host permission).
    server = createServer((req, res) => {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ path: req.url, method: req.method, echo: 'hello from 127.0.0.1' }));
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    serverUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    context = await launch(dist, userDataDir);
  });

  test.afterAll(async () => {
    await context?.close();
    await new Promise<void>((r) => server?.close(() => r()));
    if (userDataDir) rmSync(userDataDir, { recursive: true, force: true });
  });

  test('installs without MV2 flags, starts its service worker, boots the WASM modules and answers messages', async () => {
    const manifest = readManifest(mv3Dist());
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.background?.service_worker).toBe('background_sw.js');

    // --- service worker / extension id --------------------------------------
    const probe = await context.newPage();
    const cdp = await context.newCDPSession(probe);
    const workers = await findTargets(cdp, 'service_worker', 20_000);
    expect(workers.length, 'no chrome-extension:// service_worker target: the MV3 extension did not load or its worker did not start').toBe(1);
    const extensionId = new URL(workers[0].url).host;
    expect(extensionId).toMatch(/^[a-p]{32}$/);
    expect(workers[0].url).toBe(`chrome-extension://${extensionId}/background_sw.js`);
    expect(await findTargets(cdp, 'background_page', 1_000), 'an MV3 build must not have a background page').toEqual([]);
    await probe.close();

    // --- chrome://extensions-internals: installed, enabled, MV3 ------------
    const internals = await readInternals(context);
    expect(internals, 'chrome://extensions-internals did not return JSON').not.toBeNull();
    const entry = internals!.find((e) => e.id === extensionId);
    expect(entry, `extension ${extensionId} missing from chrome://extensions-internals`).toBeDefined();
    expect(entry!.name).toBe(manifest.name);
    expect(entry!.manifest_version).toBe(3);
    expect(entry!.location).toBe('COMMAND_LINE');
    expect(entry!.disable_reasons ?? []).toEqual([]);

    // --- service-worker console ---------------------------------------------
    const [sw] = context.serviceWorkers();
    expect(sw, 'Playwright did not attach to the extension service worker').toBeTruthy();
    const swErrors: string[] = [];
    sw.on('console', (msg) => {
      if (msg.type() === 'error') swErrors.push(msg.text());
    });
    // The loader's synchronous listener shim replaced `addListener` (its
    // replacement is the named function `record`); the WASM then registered
    // through it. Skipped for control builds without the shim.
    if (!process.env.AIPAGE_MV3_DIST) {
      const shim = await sw.evaluate(() => {
        type Ev = { addListener: { name: string } };
        const c = (globalThis as unknown as { chrome: { runtime: { onMessage: Ev }; alarms: { onAlarm: Ev }; action: { onClicked: Ev } } }).chrome;
        return {
          onMessage: c.runtime.onMessage.addListener.name,
          onAlarm: c.alarms.onAlarm.addListener.name,
          onClicked: c.action.onClicked.addListener.name,
        };
      });
      expect(shim).toEqual({ onMessage: 'record', onAlarm: 'record', onClicked: 'record' });
    }

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

    // --- background WASM round-trips ----------------------------------------
    expect(await sendMessage(page, { action: 'proxy_fetch' })).toEqual({ ok: false, error: 'Missing url' });
    const real = (await sendMessage(page, { action: 'proxy_fetch', payload: { url: `${serverUrl}/ping`, method: 'GET' } })) as {
      ok: boolean;
      status: number;
      data: { path: string; echo: string };
    };
    expect(real.ok, `proxy_fetch to ${serverUrl} failed: ${JSON.stringify(real)}`).toBe(true);
    expect(real.status).toBe(200);
    expect(real.data).toEqual({ path: '/ping', method: 'GET', echo: 'hello from 127.0.0.1' });

    // --- hygiene --------------------------------------------------------------
    await page.waitForTimeout(500);
    const csp = await page.evaluate(() => (window as unknown as { __aipageCspViolations: string[] }).__aipageCspViolations);
    expect(csp, 'CSP violations in sidebar.html').toEqual([]);
    expect(pageErrors, 'uncaught page errors in sidebar.html').toEqual([]);
    expect(consoleErrors, 'console errors in sidebar.html').toEqual([]);
    expect(swErrors, 'console errors in the service worker').toEqual([]);
    await page.close();
  });

  test('content script instantiates content_bg.wasm on an edupage.org page', async () => {
    // Serve a stand-in EduPage page from a Playwright route: the URL matches
    // the content-script pattern, nothing touches the network.
    await context.route('https://www.edupage.org/**', (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><html><head><title>EduPage stand-in</title></head><body><div class="edubarQuickmenu"></div></body></html>',
      }),
    );
    const page = await context.newPage();
    const logs: string[] = [];
    const errors: string[] = [];
    page.on('console', (msg) => {
      logs.push(msg.text());
      if (msg.type() === 'error') errors.push(msg.text());
    });
    page.on('pageerror', (err) => errors.push(err.message));
    await page.goto('https://www.edupage.org/', { waitUntil: 'load' });
    await expect
      .poll(() => logs.some((l) => l.includes('[AIPage] Content script loaded and active')), {
        message: `content WASM never started; console: ${JSON.stringify(logs)}`,
        timeout: 30_000,
      })
      .toBe(true);
    expect(errors.filter((e) => /wasm|AIPage|chrome-extension/i.test(e)), 'content-script errors').toEqual([]);
    await page.close();
  });

  test('a message that wakes a stopped service worker is still answered', async () => {
    const [sw] = context.serviceWorkers();
    const extensionId = new URL(sw.url()).host;
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send('ServiceWorker.enable');
    await cdp.send('ServiceWorker.stopAllWorkers');
    // The worker target disappears; a message then has to start a fresh one.
    await expect
      .poll(async () => (await findTargets(cdp, 'service_worker', 0)).length, { timeout: 15_000 })
      .toBe(0);

    await page.goto(`chrome-extension://${extensionId}/sidebar.html#initials=CI`);
    const reply = await sendMessage(page, { action: 'proxy_fetch' }, 20_000);
    expect(reply).toEqual({ ok: false, error: 'Missing url' });
    expect((await findTargets(cdp, 'service_worker', 5_000)).length).toBe(1);
    await page.close();
  });
});

test.describe('Chromium: shipped MV2 dist-chrome on the same binary (evidence only)', () => {
  test.skip(!ENABLED, 'experimental MV3 prototype; set AIPAGE_MV3=1 (bun run test:install:mv3)');

  test('records whether the MV2 build installs', async () => {
    const dist = distDir('chrome');
    test.skip(!require('node:fs').existsSync(join(dist, 'manifest.json')), 'dist-chrome not built');
    const userDataDir = mkdtempSync(join(tmpdir(), 'aipage-mv2-matrix-'));
    const context = await launch(dist, userDataDir, CHROMIUM_MV2_ARGS);
    try {
      const probe = await context.newPage();
      const cdp = await context.newCDPSession(probe);
      const backgrounds = await findTargets(cdp, 'background_page', 10_000);
      const internals = await readInternals(context);
      const entry = internals?.find((e) => e.name === 'AIPage' && e.manifest_version === 2);
      const loaded = backgrounds.length === 1 && !!entry && (entry.disable_reasons ?? []).length === 0;
      test.info().annotations.push({ type: 'mv2-on-this-binary', description: loaded ? 'load' : 'reject' });
      console.log(`[mv3.spec] MV2 dist-chrome on this binary: ${loaded ? 'LOADS' : 'REJECTED'}`);
      const expectation = process.env.AIPAGE_MV2_EXPECT;
      if (expectation === 'load') expect(loaded, 'MV2 build was expected to load on this binary').toBe(true);
      if (expectation === 'reject') expect(loaded, 'MV2 build was expected to be rejected by this binary').toBe(false);
    } finally {
      await context.close();
      rmSync(userDataDir, { recursive: true, force: true });
    }
  });
});
