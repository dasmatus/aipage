import { test as base } from '@playwright/test';

/**
 * Injected into the page before any script runs. Provides a minimal in-memory
 * `chrome.*` (and `browser`) implementation so the sidebar's WASM can mount
 * outside a real extension context. Mirrors the callback-style API the Rust
 * `aipage-bindings` crate binds against.
 */
function installChromeMock() {
  const store: Record<string, unknown> = {};
  const chrome = {
    runtime: {
      getURL: (path: string) => `/${path}`,
      sendMessage: (_msg: unknown, cb?: (r: unknown) => void) =>
        cb && cb({ ok: true, data: {} }),
      onMessage: { addListener: () => {} },
      lastError: undefined,
    },
    storage: {
      local: {
        get: (keys: unknown, cb: (items: Record<string, unknown>) => void) => {
          const out: Record<string, unknown> = {};
          const list = Array.isArray(keys) ? keys : keys ? [keys] : Object.keys(store);
          for (const k of list as string[]) if (k in store) out[k] = store[k];
          cb(out);
        },
        set: (items: Record<string, unknown>, cb?: () => void) => {
          Object.assign(store, items);
          cb && cb();
        },
      },
      onChanged: { addListener: () => {} },
    },
    tabs: {
      sendMessage: (_id: number, _msg: unknown, cb?: (r: unknown) => void) => cb && cb(null),
      query: (_q: unknown, cb: (t: unknown[]) => void) => cb([{ id: 1 }]),
    },
    browserAction: { onClicked: { addListener: () => {} } },
    notifications: { create: () => {}, clear: () => {} },
    downloads: { download: (_o: unknown, cb?: (id: number) => void) => cb && cb(1) },
    alarms: { create: () => {}, onAlarm: { addListener: () => {} } },
  };
  // @ts-expect-error test shim
  window.chrome = chrome;
  // @ts-expect-error test shim
  window.browser = chrome;
}

export const test = base.extend({
  page: async ({ page }, use) => {
    await page.addInitScript(installChromeMock);
    await use(page);
  },
});

export { expect } from '@playwright/test';
