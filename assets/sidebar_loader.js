// External ES-module bootstrap for the sidebar WASM.
//
// The MV2 extension CSP (`script-src 'self' ...`) blocks inline scripts —
// `'unsafe-inline'` is ignored in extension CSP for security — so the
// wasm-bindgen (`--target web`) entry must be loaded from a same-origin file
// rather than an inline `<script>`. `#[wasm_bindgen(start)]` runs on init.
//
// Sidebar sources, in order of precedence (documented in the user guide):
//   1. the Vercel-hosted page — chosen by the content script, never reaches
//      this file unless it fell back to the bundled `sidebar.html`;
//   2. the bundle downloaded from GitHub releases by the background into
//      IndexedDB (`aipage-ui-bundle` / `ui-bundle`), used when the
//      `ui_bundle_update_enabled` setting is on and the bundle's version is
//      not older than the installed extension; the glue js is imported as a
//      `blob:` module (hence `blob:` in the manifest `script-src`, which only
//      Manifest V2 allows — MV3 forbids remotely sourced code, so this mode is
//      MV2-only), the wasm is instantiated from its stored bytes and the
//      stylesheets are attached as `blob:` <link>s;
//   3. the files bundled with the extension (`sidebar.js` + `sidebar_bg.wasm`).
// Any failure in step 2 (missing/invalid records, hash mismatch, import or
// init error, timeout) is logged once, the broken bundle is cleared and the
// bundled files boot instead.
//
// On the hosted (Vercel) page `chrome.*` does not exist, so step 2 is skipped
// outright. `xtask build --target web` rewrites the bundled import below to
// the content-hashed glue name.

const DB_NAME = "aipage-ui-bundle";
const STORE = "ui-bundle";
const META_KEY = "meta";
const ENABLED_KEY = "ui_bundle_update_enabled";
const LOOKUP_TIMEOUT_MS = 4000;
const BOOT_TIMEOUT_MS = 20000;

function bootBundled() {
  return import("./sidebar.js").then((m) => m.default());
}

function withTimeout(promise, ms, what) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${what} timed out after ${ms} ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function isExtensionPage() {
  const c = globalThis.chrome;
  return !!(c && c.runtime && typeof c.runtime.getManifest === "function" && c.storage && c.storage.local);
}

function readSetting(key) {
  return new Promise((resolve) => {
    const done = (items) => resolve(items ? items[key] : undefined);
    try {
      // Callback style (chrome.*); a promise-returning implementation
      // (browser.* polyfills, test shims) is honoured as well.
      const r = chrome.storage.local.get([key], done);
      if (r && typeof r.then === "function") r.then(done, () => resolve(undefined));
    } catch {
      resolve(undefined);
    }
  });
}

// Component-wise version comparison (mirrors `updates::compare_versions`).
function compareVersions(a, b) {
  const pa = String(a).split(".").map((x) => parseInt(x, 10) || 0);
  const pb = String(b).split(".").map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] || 0;
    const y = pb[i] || 0;
    if (x !== y) return x > y ? 1 : -1;
  }
  return 0;
}

function openDb() {
  return new Promise((resolve, reject) => {
    // Never upgrade from here: only the background owns the schema. An
    // absent database would be created empty by `open`, so bail out first.
    const req = indexedDB.open(DB_NAME);
    req.onupgradeneeded = () => {
      // Database did not exist: abort so nothing is created.
      req.transaction.abort();
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error("IndexedDB open failed"));
    req.onblocked = () => reject(new Error("IndexedDB open blocked"));
  });
}

function getRecord(db, key) {
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, "readonly").objectStore(STORE).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error(`IndexedDB get ${key} failed`));
  });
}

function clearStore(db) {
  return new Promise((resolve) => {
    try {
      const req = db.transaction(STORE, "readwrite").objectStore(STORE).clear();
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

async function sha256Hex(buffer) {
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

// Read and verify the downloaded bundle. Resolves to `null` when there is
// nothing usable (no bundle, setting off, older than the extension) and
// throws when a bundle exists but is broken.
async function loadBundle() {
  if (!(await readSetting(ENABLED_KEY))) return null;
  if (!("indexedDB" in globalThis) || !("crypto" in globalThis) || !crypto.subtle) return null;
  let db;
  try {
    db = await openDb();
  } catch {
    return null;
  }
  try {
    if (!db.objectStoreNames.contains(STORE)) return null;
    const meta = await getRecord(db, META_KEY);
    if (!meta || !meta.version || !meta.glue || !meta.wasm) return null;
    const extVersion = chrome.runtime.getManifest().version;
    if (compareVersions(meta.version, extVersion) < 0) {
      console.info(`[AIPage] downloaded UI bundle ${meta.version} is older than the extension ${extVersion}; using the bundled UI`);
      return null;
    }
    const names = [meta.glue, meta.wasm, ...(Array.isArray(meta.css) ? meta.css : [])];
    const files = {};
    for (const name of names) {
      const rec = await getRecord(db, name);
      if (!rec || !(rec.bytes instanceof ArrayBuffer)) throw new Error(`bundle file ${name} missing from IndexedDB`);
      const expected = meta.files && meta.files[name] && meta.files[name].sha256;
      if (!expected || (await sha256Hex(rec.bytes)).toLowerCase() !== String(expected).toLowerCase()) {
        throw new Error(`bundle file ${name} failed its sha256 check`);
      }
      files[name] = rec;
    }
    return { meta, files };
  } finally {
    db.close();
  }
}

function blobUrl(rec, type) {
  return URL.createObjectURL(new Blob([rec.bytes], { type: rec.contentType || type }));
}

// Boot the downloaded bundle: blob stylesheets, blob glue module, wasm from
// bytes (`init({ module_or_path })` accepts a BufferSource, so the glue's
// `new URL('sidebar_bg.<hash>.wasm', import.meta.url)` default is never
// evaluated and no `fetch(blob:)` is needed).
async function bootBundle(bundle) {
  const { meta, files } = bundle;
  const links = [];
  for (const name of meta.css || []) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = blobUrl(files[name], "text/css");
    link.dataset.aipageBundle = meta.version;
    document.head.appendChild(link);
    links.push(link);
  }
  try {
    const mod = await import(blobUrl(files[meta.glue], "text/javascript"));
    await mod.default({ module_or_path: files[meta.wasm].bytes });
  } catch (e) {
    for (const l of links) l.remove();
    throw e;
  }
  // The downloaded stylesheets replace the bundled ones.
  for (const link of document.querySelectorAll('link[rel="stylesheet"]:not([data-aipage-bundle])')) {
    const href = link.getAttribute("href") || "";
    if (!/^https?:/i.test(href)) link.disabled = true;
  }
  console.info(`[AIPage] sidebar UI ${meta.version} (${meta.channel || "?"}, ${String(meta.sha || "").slice(0, 7)}) loaded from the downloaded GitHub bundle`);
}

async function main() {
  if (!isExtensionPage()) return bootBundled();

  let bundle = null;
  try {
    bundle = await withTimeout(loadBundle(), LOOKUP_TIMEOUT_MS, "UI bundle lookup");
  } catch (e) {
    console.warn("[AIPage] downloaded UI bundle unusable, using the bundled UI:", e && e.message ? e.message : e);
    try {
      const db = await openDb();
      await clearStore(db);
      db.close();
    } catch {
      /* nothing to clear */
    }
    bundle = null;
  }
  if (!bundle) return bootBundled();

  try {
    await withTimeout(bootBundle(bundle), BOOT_TIMEOUT_MS, "UI bundle boot");
  } catch (e) {
    console.warn("[AIPage] downloaded UI bundle failed to boot, using the bundled UI:", e && e.message ? e.message : e);
    const root = document.getElementById("root");
    if (root) root.replaceChildren();
    try {
      const db = await openDb();
      await clearStore(db);
      db.close();
    } catch {
      /* nothing to clear */
    }
    return bootBundled();
  }
}

main().catch((e) => console.error("[AIPage] sidebar failed to start:", e));
