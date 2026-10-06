import { test, expect } from '@playwright/test';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT, readManifest, requireDist } from './helpers';
import { FirefoxRdp, type ConsoleEntry } from './firefox-rdp';

/**
 * Firefox install checks:
 *  - `web-ext lint` (addons-linter) must report zero errors for `dist-firefox`
 *    and for the packaged xpi (`aipage-firefox.xpi` / `packages/*.zip` if
 *    present, otherwise one is built into a temp dir);
 *  - a real temporary install into headless Firefox through web-ext's remote
 *    debugging flow, when a Firefox binary is available (`FIREFOX_BIN`, or
 *    `firefox` on PATH); otherwise that test is skipped and says so.
 */

type LintResult = { summary: { errors: number; warnings: number; notices: number }; errors: { code: string; message: string; file?: string }[] };

async function webExt() {
  // web-ext is ESM-only; import it lazily so the file still type-checks as CJS.
  return (await import('web-ext')).cmd;
}

async function lint(sourceDir: string): Promise<LintResult> {
  const cmd = await webExt();
  return (await cmd.lint(
    { sourceDir, output: 'none', boring: true, artifactsDir: join(tmpdir(), 'aipage-lint-artifacts') },
    { shouldExitProgram: false },
  )) as LintResult;
}

function describeErrors(r: LintResult): string {
  return r.errors.map((e) => `${e.code}${e.file ? ` [${e.file}]` : ''}: ${e.message}`).join('\n');
}

async function pollFor<T>(probe: () => Promise<T | undefined>, timeoutMs: number, what: string): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const v = await probe();
    if (v !== undefined) return v;
    if (Date.now() > deadline) throw new Error(`${what} (after ${timeoutMs}ms)`);
    await new Promise((r) => setTimeout(r, 200));
  }
}

function findFirefox(): string | undefined {
  if (process.env.FIREFOX_BIN) return process.env.FIREFOX_BIN;
  const which = spawnSync('sh', ['-c', 'command -v firefox'], { encoding: 'utf8' });
  const found = which.stdout.trim();
  return which.status === 0 && found ? found : undefined;
}

test.describe('Firefox', () => {
  test('web-ext lint passes on dist-firefox', async () => {
    const result = await lint(requireDist('firefox'));
    expect(result.summary.errors, `addons-linter errors:\n${describeErrors(result)}`).toBe(0);
    test.info().annotations.push({ type: 'web-ext lint', description: `${result.summary.warnings} warnings, ${result.summary.notices} notices` });
  });

  test('web-ext lint passes on the packaged xpi', async () => {
    const dist = requireDist('firefox');
    let xpi = [resolve(ROOT, 'aipage-firefox.xpi')].find(existsSync);
    const packagesDir = resolve(ROOT, 'packages');
    if (!xpi && existsSync(packagesDir)) {
      const built = readdirSync(packagesDir).filter((f) => /\.(xpi|zip)$/.test(f)).sort();
      if (built.length) xpi = resolve(packagesDir, built[built.length - 1]);
    }
    let tmp: string | undefined;
    if (!xpi) {
      tmp = mkdtempSync(join(tmpdir(), 'aipage-xpi-'));
      const cmd = await webExt();
      const built = (await cmd.build({ sourceDir: dist, artifactsDir: tmp, overwriteDest: true }, { showReadyMessage: false })) as { extensionPath: string };
      xpi = built.extensionPath;
    }
    test.info().annotations.push({ type: 'xpi', description: xpi });
    try {
      const result = await lint(xpi);
      expect(result.summary.errors, `addons-linter errors for ${xpi}:\n${describeErrors(result)}`).toBe(0);
    } finally {
      if (tmp) rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('temporary install into headless Firefox boots the background and renders the sidebar', async () => {
    const firefox = findFirefox();
    test.skip(!firefox, 'no Firefox binary found (set FIREFOX_BIN or put `firefox` on PATH) — lint-only');
    test.info().annotations.push({ type: 'firefox', description: firefox! });
    const dist = requireDist('firefox');
    const manifest = readManifest(dist);
    const addonId = manifest.browser_specific_settings?.gecko?.id;
    expect(addonId, 'manifest.json needs browser_specific_settings.gecko.id').toBeTruthy();
    const cmd = await webExt();
    // `cmd.run` resolves only after Firefox started and the add-on was
    // installed through the remote debugging protocol; a rejected manifest
    // or a crash on install rejects the promise.
    const runner = (await cmd.run(
      {
        sourceDir: dist,
        firefox,
        args: ['-headless'],
        noReload: true,
        noInput: true,
        keepProfileChanges: false,
        artifactsDir: join(tmpdir(), 'aipage-run-artifacts'),
      },
      { shouldExitProgram: false },
    )) as { exit: () => Promise<void>; extensionRunners?: { runningInfo?: { debuggerPort?: number } }[] };
    let rdp: FirefoxRdp | undefined;
    try {
      expect(runner.extensionRunners?.length ?? 0).toBeGreaterThan(0);
      const port = runner.extensionRunners![0].runningInfo?.debuggerPort;
      expect(port, 'web-ext did not expose the Firefox remote debugging port').toBeTruthy();

      // Second RDP connection (web-ext's own client discards everything that
      // is not a reply to one of its requests).
      rdp = await FirefoxRdp.connect(port!);

      // --- the add-on is installed, temporary, and Firefox parsed the manifest cleanly
      const addon = (await rdp.listAddons()).find((a) => a.id === addonId);
      expect(addon, `add-on ${addonId} missing from listAddons`).toBeDefined();
      expect(addon!.name).toBe(manifest.name);
      expect(addon!.isWebExtension).toBe(true);
      expect(addon!.temporarilyInstalled).toBe(true);
      expect(addon!.warnings ?? [], 'Firefox reported manifest warnings for the add-on').toEqual([]);
      expect(addon!.manifestURL).toMatch(/^moz-extension:\/\/[0-9a-f-]{36}\/manifest\.json$/);
      const origin = addon!.manifestURL!.replace(/manifest\.json$/, '');
      test.info().annotations.push({ type: 'moz-extension origin', description: origin });

      // --- background page: the WASM instantiated and logged its start line
      const bg = await rdp.attach(addon!.actor);
      expect(bg.target.url).toBe(`${origin}_generated_background_page.html`);
      const bgLog = await rdp.watchConsole(bg.watcher, bg.target);
      await bgLog.waitFor('aipage background wasm loaded');

      // --- open sidebar.html in a tab from the extension's own context
      await rdp.evaluateAsyncJson(
        bg.target.consoleActor,
        `browser.tabs.create({ url: browser.runtime.getURL('sidebar.html#initials=CI') }).then((t) => t.id)`,
      );
      const sidebarUrl = `${origin}sidebar.html#initials=CI`;
      const tabDescriptor = await pollFor(
        async () => (await rdp!.listTabs()).find((t) => t.url === sidebarUrl),
        15_000,
        `no tab navigated to ${sidebarUrl}`,
      );

      // --- sidebar.html: WASM booted, Leptos rendered, CSP did not block anything
      const tab = await rdp.attach(tabDescriptor.actor);
      expect(tab.target.url).toBe(sidebarUrl);
      const tabLog = await rdp.watchConsole(tab.watcher, tab.target);
      await tabLog.waitFor('aipage sidebar wasm loaded');
      await expect
        .poll(() => rdp!.evaluate(tab.target.consoleActor, `document.querySelectorAll('#root button').length`), {
          message: 'Leptos did not render any button into #root',
          timeout: 15_000,
        })
        .toBeGreaterThan(0);
      expect(await rdp.evaluate(tab.target.consoleActor, 'document.title')).toBe('AIPage');

      // --- round-trip to the background WASM through runtime.sendMessage
      // `proxy_fetch` without a URL is answered by the Rust handler with
      // {ok:false, error:"Missing url"}: a reply proves the background's
      // `runtime.onMessage` listener is live and the async sendResponse
      // channel works on Firefox.
      const reply = await rdp.evaluateAsyncJson(tab.target.consoleActor, `browser.runtime.sendMessage({ action: 'proxy_fetch' })`);
      expect(reply).toEqual({ ok: false, error: 'Missing url' });

      // --- hygiene: nothing from the extension origin errored
      await new Promise((r) => setTimeout(r, 500));
      const describe = (entries: ConsoleEntry[]) => entries.map((e) => `${e.kind}/${e.level}: ${e.text}`);
      expect(describe(bgLog.errors()), 'errors logged by the background page').toEqual([]);
      expect(describe(tabLog.errors()), 'errors logged by sidebar.html').toEqual([]);
    } finally {
      rdp?.close();
      await runner.exit();
    }
  });
});
