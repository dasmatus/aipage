# E2E UI tests (Playwright)

End-to-end tests that drive the built Leptos/WASM sidebar in a real browser.

## Running

```bash
# 1. Build the extension (produces dist-chrome/)
cargo run -p xtask -- build --target chrome
# or: bun run build:rust

# 2. Run the tests (serves dist-chrome over HTTP automatically)
bun run test:e2e
```

`playwright.config.ts` starts a static server (`scripts/serve-dist.ts`) for
`dist-chrome/` and points the tests at `http://localhost:4173`.

## How it works

- `fixtures.ts` injects a minimal in-memory `chrome.*` / `browser` mock before
  page scripts run, so the sidebar's WASM can mount **outside** a real extension
  context. The mock mirrors the callback-style API that `aipage-bindings` binds
  against (`storage.local`, `runtime.sendMessage`, `tabs`, …).
- `sidebar.spec.ts` loads `sidebar.html` and asserts the page shell plus the
  WASM boot log — proving wasm-bindgen glue, ES-module load, instantiation and
  the `start()` entrypoint all work in-browser. Richer UI assertions are added
  as the Leptos components land.

## ⚠️ secureblue / hardened_malloc note

This repo is developed on **secureblue**, which preloads a hardened allocator:

```
LD_PRELOAD=libhardened_malloc.so libno_rlimit_as.so
```

Chromium and Firefox ship their own allocators and **crash** under it
(`fatal allocator error: invalid uninitialized allocator usage`). The
`test:e2e` scripts therefore launch via `env -u LD_PRELOAD …`, which clears the
preload for the test process and the browsers it spawns. On normal Linux/macOS
the `env -u` prefix is a harmless no-op. If you invoke `playwright` directly,
prefix it yourself: `env -u LD_PRELOAD bunx playwright test`.
