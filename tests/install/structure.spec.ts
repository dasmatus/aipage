import { test, expect } from '@playwright/test';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  ROOT,
  TARGETS,
  VERSION_RE,
  htmlLocalAssets,
  inlineScriptViolations,
  manifestReferencedFiles,
  readManifest,
  requireDist,
} from './helpers';

/**
 * Structural checks of every dist. This is the only install check possible
 * for Safari on Linux (Safari cannot run here and the Xcode converter just
 * wraps `dist-safari`), and it is cheap enough to run for all three targets.
 */
for (const target of TARGETS) {
  test.describe(`dist-${target} structure`, () => {
    test('manifest parses and is a valid MV2 manifest', () => {
      const dir = requireDist(target);
      const m = readManifest(dir);
      expect(m.manifest_version).toBe(2);
      expect(m.name).toBe('AIPage');
      expect(m.version, `manifest version "${m.version}" must be 1–4 dot-separated integers`).toMatch(VERSION_RE);
      expect(m.background?.scripts ?? []).toContain('background_loader.js');
      expect(m.content_scripts?.length ?? 0).toBeGreaterThan(0);
      expect(m.content_security_policy).toContain("script-src 'self'");
      // The extension CSP forbids inline scripts, so the WASM boot must come
      // from external files.
      expect(m.content_security_policy).not.toContain("'unsafe-inline'");
      // The self-updating sidebar imports the downloaded glue as a blob:
      // module (MV2-only; MV3 forbids remotely sourced code) and the update
      // manager talks to GitHub (API, release pages, asset redirects).
      expect(m.content_security_policy).toMatch(/script-src [^;]*\bblob:/);
      for (const host of ['https://api.github.com', 'https://github.com', 'https://objects.githubusercontent.com']) {
        expect(m.content_security_policy).toMatch(new RegExp(`connect-src [^;]*${host.replace(/[.]/g, '\\.')}`));
        expect(m.permissions as string[]).toContain(`${host}/*`);
      }
      expect(m.permissions as string[]).not.toContain('https://codeberg.org/*');
      if (target === 'firefox') expect(m.browser_specific_settings?.gecko?.id).toBeTruthy();
      // `version_name` is Chrome-only; xtask drops it for the other targets.
      if (target !== 'chrome') expect(m.version_name).toBeUndefined();
    });

    test('every file the manifest references exists', () => {
      const dir = requireDist(target);
      const missing = manifestReferencedFiles(readManifest(dir)).filter((f) => !existsSync(resolve(dir, f)));
      expect(missing, `missing files referenced by manifest.json: ${missing.join(', ')}`).toEqual([]);
    });

    test('wasm modules and their loaders are present and well-formed', () => {
      const dir = requireDist(target);
      for (const name of ['sidebar', 'background', 'content']) {
        const wasm = resolve(dir, `${name}_bg.wasm`);
        expect(existsSync(wasm), `${name}_bg.wasm missing`).toBe(true);
        const magic = readFileSync(wasm).subarray(0, 4);
        expect(magic, `${name}_bg.wasm does not start with the wasm magic bytes`).toEqual(Buffer.from([0x00, 0x61, 0x73, 0x6d]));
        expect(existsSync(resolve(dir, `${name}.js`)), `${name}.js (wasm-bindgen glue) missing`).toBe(true);
        expect(existsSync(resolve(dir, `${name}_loader.js`)), `${name}_loader.js missing`).toBe(true);
      }
    });

    test('sidebar.html has no inline scripts and only references bundled files', () => {
      const dir = requireDist(target);
      const html = readFileSync(resolve(dir, 'sidebar.html'), 'utf8');
      expect(inlineScriptViolations(html)).toEqual([]);
      expect(html).toMatch(/<script[^>]+type=["']module["'][^>]+src=["']\.?\/?sidebar_loader\.js["']/);
      const missing = htmlLocalAssets(html).filter((f) => !existsSync(resolve(dir, f)));
      expect(missing, `sidebar.html references files missing from the dist: ${missing.join(', ')}`).toEqual([]);
    });
  });
}

test('all three dists carry the same manifest version', () => {
  const versions = TARGETS.map((t) => readManifest(requireDist(t)).version);
  expect(new Set(versions).size, `versions differ across dists: ${versions.join(' / ')}`).toBe(1);
});

/**
 * What Apple's `safari-web-extension-packager` / `-converter` and the macOS
 * wrapper build (scripts/setup-safari.sh, run by the macOS job of
 * .github/workflows/build.yml) need from dist-safari. The tools themselves
 * only run on macOS; these checks catch the manifest shapes they reject or
 * warn about before a nightly reaches the macOS runner.
 */
test.describe('dist-safari: ready for the Safari app wrapper', () => {
  test('manifest uses only shapes Safari accepts', () => {
    const m = readManifest(requireDist('safari'));
    // Safari (macOS 11+) supports MV2 with a non-persistent background page;
    // iOS/Safari 15+ require non-persistent, and the generator warns about
    // persistent pages, so keep it off.
    expect(m.background?.persistent, 'background.persistent must be false for Safari').toBe(false);
    expect(m.background?.page, 'Safari needs background.scripts, not a background.page').toBeUndefined();
    // MV2 shapes: plain string lists.
    for (const r of m.web_accessible_resources ?? []) expect(typeof r).toBe('string');
    for (const p of (m.permissions as unknown[]) ?? []) expect(typeof p).toBe('string');
    // Firefox/Chrome-only keys the generator reports as unsupported.
    expect(m.browser_specific_settings).toBeUndefined();
    expect(m.version_name).toBeUndefined();
    expect(m).not.toHaveProperty('minimum_chrome_version');
    expect(m).not.toHaveProperty('update_url');
    // The toolbar button and the sidebar page the app wrapper exposes.
    expect(m.browser_action?.default_title).toBeTruthy();
    expect(m.web_accessible_resources).toContain('sidebar.html');
    // Safari supports 'wasm-unsafe-eval' since 16; the wrapper's CSP is the
    // manifest's, so the WASM boot must stay allowed.
    expect(m.content_security_policy).toContain("'wasm-unsafe-eval'");
  });

  test('every file is a plain file the app bundle can copy', () => {
    const dir = requireDist('safari');
    const entries = readdirSync(dir, { withFileTypes: true });
    expect(entries.length).toBeGreaterThan(0);
    for (const e of entries) {
      expect(e.isFile(), `${e.name} is not a regular file (the generator copies files only)`).toBe(true);
      expect(e.name, `${e.name}: Xcode resource names must not start with a dot`).not.toMatch(/^\./);
    }
    // The generator refuses a dist that is not self-contained: a symlink or
    // a reference outside the folder would break `--copy-resources`.
    for (const e of entries) expect(lstatSync(resolve(dir, e.name)).isSymbolicLink(), `${e.name} is a symlink`).toBe(false);
  });

  test('scripts/setup-safari.sh (used by the macOS job) is present and well-formed', () => {
    const script = resolve(ROOT, 'scripts', 'setup-safari.sh');
    expect(existsSync(script)).toBe(true);
    expect(statSync(script).mode & 0o111, 'setup-safari.sh must be executable').not.toBe(0);
    const src = readFileSync(script, 'utf8');
    expect(src.startsWith('#!/usr/bin/env bash')).toBe(true);
    // The macOS job relies on exactly these flags/names.
    for (const needle of ['--macos-only', '--copy-resources', '--no-prompt', '--no-open', '--force', 'CODE_SIGNING_ALLOWED=NO', '--package']) {
      expect(src, `setup-safari.sh lost ${needle}`).toContain(needle);
    }
    const syntax = spawnSync('bash', ['-n', script], { encoding: 'utf8' });
    expect(syntax.status, `bash -n: ${syntax.stderr}`).toBe(0);
  });
});

/**
 * `dist-web/aipage-web.json` (written by `xtask build --target web`) is the
 * hash manifest the extension's self-updating sidebar verifies release assets
 * against, so it must describe the files on disk exactly. Only checked when
 * `dist-web` exists: the web target is optional for the browser builds.
 */
test.describe('dist-web hash manifest', () => {
  const dir = resolve(ROOT, 'dist-web');
  const manifestPath = resolve(dir, 'aipage-web.json');
  test.skip(!existsSync(dir), 'dist-web/ not built (cargo run -p xtask -- build --target web)');

  test('aipage-web.json matches the files on disk', () => {
    expect(existsSync(manifestPath), 'dist-web/aipage-web.json missing').toBe(true);
    const m = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
      version: string;
      sha: string;
      built_at: string;
      files: Record<string, { sha256: string; size: number }>;
    };
    expect(m.version).toMatch(VERSION_RE);
    expect(m.built_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    expect(typeof m.sha).toBe('string');

    const names = Object.keys(m.files);
    expect(names).toContain('sidebar.html');
    expect(names.filter((n) => /^sidebar\.[0-9a-f]+\.js$/.test(n)), 'exactly one hashed glue js').toHaveLength(1);
    expect(names.filter((n) => /^sidebar_bg\.[0-9a-f]+\.wasm$/.test(n)), 'exactly one hashed wasm').toHaveLength(1);
    expect(names.filter((n) => /\.css$/.test(n)).length, 'stylesheets listed').toBeGreaterThan(0);

    for (const [name, entry] of Object.entries(m.files)) {
      const path = resolve(dir, name);
      expect(existsSync(path), `${name} listed in aipage-web.json but missing`).toBe(true);
      const bytes = readFileSync(path);
      expect(bytes.length, `${name} size`).toBe(entry.size);
      expect(createHash('sha256').update(bytes).digest('hex'), `${name} sha256`).toBe(entry.sha256.toLowerCase());
    }

    // Every published file is listed, except the deployment config and the manifest itself.
    const onDisk = readdirSync(dir)
      .filter((f) => statSync(resolve(dir, f)).isFile() && f !== 'vercel.json' && f !== 'aipage-web.json')
      .sort();
    expect(names.slice().sort()).toEqual(onDisk);
  });
});
