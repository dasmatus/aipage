import { test, expect } from '@playwright/test';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT, requireDist } from './helpers';

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

  test('temporary install into headless Firefox succeeds', async () => {
    const firefox = findFirefox();
    test.skip(!firefox, 'no Firefox binary found (set FIREFOX_BIN or put `firefox` on PATH) — lint-only');
    test.info().annotations.push({ type: 'firefox', description: firefox! });
    const dist = requireDist('firefox');
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
    )) as { exit: () => Promise<void>; extensionRunners?: unknown[] };
    try {
      expect(runner.extensionRunners?.length ?? 1).toBeGreaterThan(0);
    } finally {
      await runner.exit();
    }
  });
});
