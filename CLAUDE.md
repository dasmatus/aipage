# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

A cross-browser extension (Chrome, Firefox, Safari) that injects an AI-powered sidebar into [EduPage](https://edupage.org), an educational platform. The sidebar lets students chat with AI, scan page content for context, and run web searches — all without leaving EduPage.

The extension is written in **Rust, compiled to WebAssembly** (`wasm32-unknown-unknown`) via `wasm-bindgen`, with a **Leptos** UI. The only non-Rust pieces are the `manifest.json` files, `sidebar.html`, two ~5-line JS bootstrap loaders that instantiate the background/content WASM, and `anti_cheat.js` (which must run in the host page's JS context). All of these live in `assets/`.

## Branching

Always create a new branch before making any code changes:

```bash
git checkout -b feat/short-description   # or fix/short-description
```

Never commit directly to `main`.

## Commands

```bash
# Build (runs cargo + wasm-bindgen + wasm-opt + Tailwind/Sass + asset copy)
cargo run -p xtask -- build --target chrome     # or firefox / safari
cargo run -p xtask -- build-all
bun run build                                   # alias for the chrome build

# Tests
cargo test --workspace                          # native unit tests (logic)
bun run test:e2e                                # Playwright UI tests (see below)

# Lint
cargo clippy --workspace --all-targets

# Package
bun run package:chrome     # zip dist-chrome
bun run package:firefox    # web-ext xpi
```

After building, load `dist-chrome/` (or the relevant dist dir) as an unpacked extension. MV2 on Chrome requires Brave or developer mode.

**Toolchain:** needs the `wasm32-unknown-unknown` target, `wasm-bindgen-cli` (version must match the `wasm-bindgen` crate in `Cargo.lock`), and `wasm-opt` (binaryen) for size optimisation. `bun` is used only to run the Tailwind/Sass CLIs and Playwright.

**Local host note:** on this secureblue dev box, `LD_PRELOAD=libhardened_malloc.so` crashes Chromium/Firefox, so the `test:e2e` scripts run via `env -u LD_PRELOAD`. See `tests/e2e/README.md`.

## Architecture

A Cargo workspace. The three browser contexts are separate `cdylib` crates; shared logic lives in libraries.

```
crates/
  aipage-bindings/   # hand-rolled wasm-bindgen bindings to the chrome.* WebExtension API
  aipage-core/       # shared logic: types, storage, i18n, providers, agent loop, imagegen, markdown, chat heuristics
  aipage-sidebar/    # cdylib → wasm: the Leptos CSR sidebar UI
  aipage-background/ # cdylib → wasm: CORS proxy, web search, toolbar toggle, update manager
  aipage-content/    # cdylib → wasm: navbar button, sidebar iframe controller, theming, exam tools, anti-cheat
xtask/               # Rust build orchestrator (replaces the old build.ts)
assets/              # manifests (×3), sidebar.html, JS loaders, anti_cheat.js, sidebar.scss, tailwind.css
```

### Key components

- **`aipage-bindings`** — binds the callback-based `chrome.*` namespace (which Chrome, Firefox and Safari all expose) and wraps callbacks into Rust futures. Replaces `webextension-polyfill`; no JS polyfill is shipped.
- **`aipage-core`**:
  - `providers/` — `Anthropic`, `Ollama`, `LMStudio`, dispatched by `ProviderType`. The Anthropic provider hits the Messages API directly with `serde` (no `@anthropic-ai/sdk`).
  - `proxy.rs` — `perform_request`/`post_json` route every external request through the background CORS proxy (`runtime.sendMessage({ action: 'proxy_fetch' })`).
  - `agent.rs` — Anthropic Managed-Agents polling loop; browser-side tools dispatched via `tabs.sendMessage`. Falls back to a direct Claude reply on any error.
  - `imagegen.rs` — Claude-SVG (rasterized to PNG with `resvg`/`tiny-skia`) + SD WebUI.
  - `storage.rs` — typed wrappers over `storage.local`; **keys are identical to the old TS build** so existing installs keep their settings.
  - `i18n.rs` + `locales/*.json` — 5 languages (`sk` default), deserialized into a typed `Translation`.
- **`aipage-sidebar`** — Leptos app. `state.rs` holds the reactive `AppState`/`ChatState` contexts and all async actions; `components/` holds the chat, settings and widgets views; `icons.rs` inlines Lucide-style SVGs.

### Key constraints

- **WASM only:** browsers cannot run native Rust. Any new crate dependency must compile to `wasm32-unknown-unknown` (no `tokio`/`mio`/threads).
- **CORS proxy is mandatory:** the sidebar iframe cannot fetch external APIs directly — everything goes through `aipage-core::proxy`.
- **No streaming:** the proxy is one-shot request/response. The agent loop *polls* `sessions/{id}/events` instead of using SSE.
- **Manifest V2:** all three manifests are MV2 (required for Firefox/Safari). CSP includes `'unsafe-eval' 'wasm-unsafe-eval'` for WASM instantiation. **No inline scripts:** extension pages forbid them (`'unsafe-inline'` is ignored), so `sidebar.html` boots the WASM via an external `sidebar_loader.js`, never an inline `<script>`. The Playwright server (`scripts/serve-dist.ts`) replays the manifest CSP on HTML responses so the harness catches such violations.
- **WASM in content scripts:** the content WASM is fetched from the extension origin via `runtime.getURL` and listed in `web_accessible_resources`; if a target browser blocks instantiation in the content-script world, fall back to a thin JS content bridge.
- **User initials via URL hash:** the content script passes initials to the sidebar via `iframe.src = sidebar.html#initials=XY`.
