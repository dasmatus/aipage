import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export type Target = 'chrome' | 'firefox' | 'safari';
export const TARGETS: Target[] = ['chrome', 'firefox', 'safari'];

/** Repository root (the config lives there; Playwright runs from it). */
export const ROOT = resolve(__dirname, '..', '..');

/** Absolute path of `dist-<target>/`. */
export function distDir(target: Target): string {
  return resolve(ROOT, `dist-${target}`);
}

/**
 * Fail loudly (not skip) when a dist is missing: the install tests are meant
 * to run against a fresh build, and a silent skip would hide a broken build.
 */
export function requireDist(target: Target): string {
  const dir = distDir(target);
  if (!existsSync(resolve(dir, 'manifest.json'))) {
    throw new Error(
      `${dir}/manifest.json not found — build it first: ` +
        `cargo run -p xtask -- build --target ${target} (or build-all)`,
    );
  }
  return dir;
}

export type Manifest = {
  manifest_version: number;
  name: string;
  version: string;
  version_name?: string;
  background?: { scripts?: string[]; page?: string; persistent?: boolean };
  content_scripts?: { js?: string[]; css?: string[]; matches: string[] }[];
  web_accessible_resources?: string[];
  browser_action?: { default_popup?: string; default_icon?: string | Record<string, string> };
  icons?: Record<string, string>;
  options_ui?: { page?: string };
  options_page?: string;
  content_security_policy?: string;
  browser_specific_settings?: { gecko?: { id?: string } };
  [key: string]: unknown;
};

export function readManifest(dir: string): Manifest {
  return JSON.parse(readFileSync(resolve(dir, 'manifest.json'), 'utf8')) as Manifest;
}

/**
 * Manifest `version` rules shared by Chrome, Firefox (addons-linter) and
 * Safari: 1–4 dot-separated integers, no leading zeros, ≤ 9 digits each
 * (mirrors `validate_manifest_version` in xtask).
 */
export const VERSION_RE = /^(0|[1-9]\d{0,8})(\.(0|[1-9]\d{0,8})){0,3}$/;

/**
 * Chromium feature flags that still allow an unpacked Manifest V2 extension
 * to load now that MV2 is deprecated. Verified empirically on Chromium 141
 * (Playwright build 1194): with no flags the extension is not installed at
 * all (absent from chrome://extensions-internals); with either flag it
 * installs and its `_generated_background_page.html` target appears.
 * Unknown feature names are ignored by Chromium, so passing both keeps the
 * test working when one of them is retired upstream.
 */
export const CHROMIUM_MV2_ARGS = [
  '--disable-features=ExtensionManifestV2Disabled,ExtensionManifestV2Unsupported',
  '--enable-features=AllowLegacyMV2Extensions',
];

/** Every file a manifest references, relative to the dist dir. */
export function manifestReferencedFiles(m: Manifest): string[] {
  const files = new Set<string>();
  for (const s of m.background?.scripts ?? []) files.add(s);
  if (m.background?.page) files.add(m.background.page);
  for (const cs of m.content_scripts ?? []) {
    for (const f of [...(cs.js ?? []), ...(cs.css ?? [])]) files.add(f);
  }
  for (const r of m.web_accessible_resources ?? []) {
    if (typeof r === 'string' && !r.includes('*')) files.add(r);
  }
  if (m.browser_action?.default_popup) files.add(m.browser_action.default_popup);
  const icon = m.browser_action?.default_icon;
  if (typeof icon === 'string') files.add(icon);
  else if (icon) for (const f of Object.values(icon)) files.add(f);
  for (const f of Object.values(m.icons ?? {})) files.add(f);
  if (m.options_ui?.page) files.add(m.options_ui.page);
  if (m.options_page) files.add(m.options_page);
  return [...files];
}

/** Relative `src`/`href` targets of local `<script>` / `<link rel=stylesheet>` tags. */
export function htmlLocalAssets(html: string): string[] {
  const out: string[] = [];
  const re = /<(script|link)\b[^>]*?(?:src|href)\s*=\s*["']([^"']+)["'][^>]*>/gi;
  for (const m of html.matchAll(re)) {
    const url = m[2];
    if (/^(https?:)?\/\//i.test(url) || url.startsWith('data:')) continue;
    if (m[1].toLowerCase() === 'link' && !/rel\s*=\s*["']stylesheet["']/i.test(m[0])) continue;
    out.push(url.replace(/^\.\//, ''));
  }
  return out;
}

/** Remove HTML comments, repeating until none remain (nested `<!--` left by one pass). */
function stripHtmlComments(html: string): string {
  let out = html;
  for (;;) {
    const next = out.replace(/<!--[\s\S]*?-->/g, '');
    if (next === out) return out;
    out = next;
  }
}

/** Inline-script constructs an MV2 extension page CSP (`script-src 'self'`) blocks. */
export function inlineScriptViolations(html: string): string[] {
  const violations: string[] = [];
  const stripped = stripHtmlComments(html);
  for (const m of stripped.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\b[^>]*>/gi)) {
    if (!/\bsrc\s*=/.test(m[1]) && m[2].trim() !== '') violations.push(`inline <script>: ${m[2].trim().slice(0, 60)}`);
  }
  for (const m of stripped.matchAll(/\son[a-z]+\s*=\s*["'][^"']*["']/gi)) violations.push(`inline handler: ${m[0].trim()}`);
  for (const m of stripped.matchAll(/(?:href|src)\s*=\s*["']javascript:[^"']*["']/gi)) violations.push(`javascript: URL: ${m[0]}`);
  return violations;
}
