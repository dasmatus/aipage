import { test, expect } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
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
