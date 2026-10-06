# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

A cross-browser extension (Chrome, Firefox, Safari) that injects an AI-powered sidebar into [EduPage](https://edupage.org). Students chat with an AI backend (with page-reading / exam tools on the cloud providers), scan page content for context, run web searches and generate images without leaving EduPage.

The extension is written in **Rust, compiled to WebAssembly** (`wasm32-unknown-unknown`) via `wasm-bindgen`, with a **Leptos** UI. The only non-Rust pieces are the `manifest.json` files, `sidebar.html`, two ~5-line JS bootstrap loaders that instantiate the background/content WASM, `anti_cheat.js` (which must run in the host page's JS context), the stylesheets and `vercel.json`. All of these live in `assets/`.

## Branching

Always create a new branch before making any code changes:

```bash
git checkout -b feat/short-description   # or fix/short-description
```

Never commit directly to `main`.

## Commands

```bash
# Build (cargo + wasm-bindgen + wasm-opt + Sass/Tailwind + asset copy) → dist-<target>/
cargo run -p xtask -- build --target chrome     # or firefox / safari
cargo run -p xtask -- build-all                 # the three browsers
cargo run -p xtask -- build --target web        # hosted sidebar only → dist-web/ (hashed assets + vercel.json + aipage-web.json hash manifest)
bun run build                                   # alias for the chrome build

# Nightly-style manifest version stamp (version_name is Chrome-only)
cargo run -p xtask -- build-all --version-stamp 1.7.0.20261006 --version-name "1.7.0-nightly.20261006+abc1234"

# Tests
cargo test --workspace                          # native unit tests (pure logic)
bun run test:install                            # install tests against the built dist-*/ (tests/install/README.md)
bun run test:e2e                                # Playwright UI tests over a served dist-chrome (tests/e2e/README.md)

# Lint
cargo clippy --workspace --all-targets -- -D warnings

# Package
bun run package:chrome     # zip dist-chrome
bun run package:firefox    # web-ext xpi
```

After building, load `dist-chrome/` (or the relevant dist dir) unpacked. **Manifest V2 on Chromium:** current Chrome/Chromium (153+, which is also what Playwright 1.63 bundles) no longer loads MV2 extensions at all, not even unpacked with `--load-extension`; the `ExtensionManifestV2Disabled`/`ExtensionManifestV2Unsupported` features, `AllowLegacyMV2Extensions` and the `ExtensionManifestV2Availability` enterprise policy no longer exist in that binary (MV3 extensions load fine). The Chrome build is only installable on Chromium ≤ 141-era builds (with those flags) or browsers that still allow MV2; CI pins the Chromium install test to Chrome 141. An MV3 manifest for Chrome is the pending fix. Brave (1.96+) still loads it and passes the install test; CI runs the Chromium install spec on both Chromium 141 and the latest Brave.

**Toolchain:** the `wasm32-unknown-unknown` target, `wasm-bindgen-cli` (version must match the `wasm-bindgen` crate in `Cargo.lock`), `wasm-opt` (binaryen) for size optimisation, and `bun` (only for the Sass/PostCSS CLIs, Playwright and `web-ext`). `flake.nix` pins all of it and CI runs every step inside `nix develop`.

**Local host note:** on secureblue, `LD_PRELOAD=libhardened_malloc.so` crashes Chromium/Firefox, so the Playwright scripts run via `env -u LD_PRELOAD`.

## Architecture

A Cargo workspace. The three browser contexts are separate `cdylib` crates; shared logic lives in libraries.

```
crates/
  aipage-bindings/   # wasm-bindgen bindings to chrome.*, the Direct/Bridge transport, JSON interop helpers
  aipage-core/       # shared logic: types, storage, i18n, providers, agent loop, imagegen, markdown, chat heuristics, remote_ui, updates
  aipage-sidebar/    # cdylib → wasm: the Leptos CSR sidebar UI
  aipage-background/ # cdylib → wasm: CORS proxy, DuckDuckGo search, toolbar toggle, GitHub update check, sidebar-bundle download (IndexedDB)
  aipage-content/    # cdylib → wasm: navbar button, sidebar iframe + hosted-UI bridge host, theming, exam tools, anti-cheat
xtask/               # Rust build orchestrator (browser targets, the web target + aipage-web.json, version stamping)
assets/              # manifests (×3), sidebar.html, JS loaders (sidebar_loader.js also boots the downloaded bundle), anti_cheat.js, sidebar.scss, tailwind.css, vercel.json
tests/install/       # Playwright: real unpacked install in Chromium, web-ext lint / temporary install in Firefox, dist structure
tests/e2e/           # Playwright: sidebar served over HTTP with a mocked chrome.* (scripts/serve-dist.ts)
.github/workflows/   # ci, build (reusable), release (v* tags), nightly (rolling pre-release), deploy-web (Vercel)
```

### Key components

- **`aipage-bindings`** — binds the callback-based `chrome.*` namespace (which Chrome, Firefox and Safari all expose) and wraps callbacks into Rust futures; no JS polyfill is shipped. `transport()` detects whether `chrome.*` exists; without it (the hosted sidebar) the five calls the sidebar needs go over the postMessage `bridge` (protocol documented in `bridge.rs`). `to_js`/`from_js`/`js_object` and `tabs::send_json*` are the shared JSON interop helpers.
- **`aipage-core`**:
  - `types.rs` — `ProviderType` (`ollama-cloud` default, `openrouter`, `openai`, `anthropic`, `lmstudio`, `ollama`; the serialized strings are persisted) and the predicates the UI dispatches on (`is_local`, `requires_api_key`, `supports_native_tools`).
  - `providers/` — `openai_compat::OpenAiCompat` is one static config per OpenAI-compatible backend (chat completions + `/v1/models`, Bearer auth); `anthropic.rs` speaks the Messages API, `ollama.rs` the native local API, `openai.rs` only filters the model list and `lmstudio.rs` only derives its models URL. `providers/mod.rs` carries the "Adding a provider" checklist.
  - `agent.rs` — client-side tool-calling loops (OpenAI function tools and Anthropic `tool_use`) over the browser tools (page content, exam question, fill answer, DuckDuckGo search) for every provider with `supports_native_tools`; the sidebar falls back to a plain reply on error.
  - `proxy.rs` — `perform_request`/`post_json` route every external request through the background CORS proxy (`runtime.sendMessage({ action: 'proxy_fetch' })`).
  - `imagegen.rs` — an SVG drawn by the chat model and rasterized with `resvg`/`tiny-skia`, or SD WebUI.
  - `storage.rs` — typed wrappers over `storage.local`; **the key strings are the persisted contract**, never rename them.
  - `remote_ui.rs` — hosted-UI constants (`DEFAULT_REMOTE_UI_URL`, storage keys) and pure URL/origin helpers.
  - `updates.rs` — everything pure about updates: `UpdateChannel` (`stable` default | `nightly`, key `update_channel`), the GitHub release API URLs, `compare_versions` (component-wise; nightly `base.YYYYMMDD` sorts above its base), the extension/bundle "is newer" rules (equal version + different commit = nightly rebuild), browser-package matching by prefix, the `aipage-web.json` manifest (`WebManifest`), `sha256_hex` and the `ui_source` precedence (hosted → GitHub bundle → bundled).
  - `i18n.rs` + `locales/*.json` — 5 languages (`sk` default) deserialized into a typed `Translation`; every key must exist in all five files (the locale test enforces it).
- **`aipage-sidebar`** — Leptos app. `state.rs` holds the reactive `AppState`/`ChatState` and all async actions; `components/` the chat, settings and widgets views; `icons.rs` inline SVGs. It runs either from the extension bundle or from the hosted origin (Vercel) over the bridge transport.
- **`aipage-background`** — `update.rs` polls the channel's GitHub release hourly (`alarms`) and on demand (`check_updates` message from settings): notifies + downloads the matching browser package via `downloads` (Auto-update), and with `ui_bundle_update_enabled` on runs `ui_bundle.rs`, which downloads the glue/wasm/css listed in the release's `aipage-web.json` as individual assets, verifies each sha256 and writes them to IndexedDB (`aipage-ui-bundle`/`ui-bundle`, records per file + `meta`; helpers in `aipage-bindings::idb`). `ui_bundle_status` / `ui_bundle_clear` serve the settings card. The nightly tag is `nightly`, so its version/commit come from the `nightly.json` asset.
- **`assets/sidebar_loader.js`** — before importing the bundled `sidebar.js`, checks `ui_bundle_update_enabled` + the IndexedDB `meta`; if a bundle not older than the extension is installed it imports the downloaded glue as a `blob:` module (`script-src … blob:` in the MV2 manifests), instantiates the wasm from bytes and attaches the css as `blob:` links; any failure logs once, clears the bundle and boots the bundled files. MV2-only: MV3 forbids remotely sourced code.
- **`aipage-content`** — `sidebar_controller.rs` loads the hosted sidebar by default and falls back to the bundled one when the bridge does not connect within 8 s; `bridge.rs` is the privileged bridge end (origin + source checks, private `MessageChannel`).

### Key constraints

- **WASM only:** any new crate dependency must compile to `wasm32-unknown-unknown` (no `tokio`/`mio`/threads). Pure logic goes in `aipage-core` so `cargo test` covers it natively.
- **CORS proxy is mandatory:** the sidebar cannot fetch external APIs directly; everything goes through `aipage-core::proxy`. A new API host goes into all three manifests (`permissions` and the CSP `connect-src`).
- **No streaming:** the proxy is one-shot request/response; the agent loop re-POSTs instead of using SSE.
- **Manifest V2:** all three manifests are MV2 (required for Firefox/Safari; see the Chromium note above). CSP includes `'unsafe-eval' 'wasm-unsafe-eval'` for WASM instantiation. **No inline scripts:** extension pages forbid them (`'unsafe-inline'` is ignored), so `sidebar.html` boots via the external `sidebar_loader.js`; `scripts/serve-dist.ts` replays the manifest CSP so the e2e harness catches violations, and the structure install test rejects inline scripts.
- **WASM in content scripts:** the content WASM is fetched from the extension origin via `runtime.getURL` and listed in `web_accessible_resources`.
- **Hosted UI:** the content script passes initials via `sidebar.html#initials=XY` to both the bundled and the hosted page; the hosted page may only be embedded by `*.edupage.org` (`frame-ancestors` in `assets/vercel.json`).
- **Updates come from GitHub Releases:** `release.yml` (tags `vX.Y.Z`) and `nightly.yml` (tag `nightly`, version `<base>.<YYYYMMDD>`) upload `aipage-chrome.zip`, `aipage-firefox.xpi`, `aipage-safari.zip`, `aipage-web.zip`, `aipage-web.json` and the individual `dist-web` files; the manifests allow `https://api.github.com`, `https://github.com` and `https://objects.githubusercontent.com` (asset downloads redirect there). Sidebar precedence: Vercel hosted → GitHub-downloaded bundle → bundled.
- **Persisted contracts:** storage keys, the `ProviderType` strings, the bridge wire format (`aipage-bindings/src/bridge.rs`) and the IndexedDB bundle schema shared by `ui_bundle.rs` and `sidebar_loader.js` must stay stable.

## Validation before committing

```bash
cargo test --workspace
cargo clippy --workspace --all-targets -- -D warnings
cargo check --target wasm32-unknown-unknown -p aipage-sidebar -p aipage-background -p aipage-content
cargo run -p xtask -- build --target chrome && cargo run -p xtask -- build --target web && env -u LD_PRELOAD bun run test:install:structure
```

`book/src/changelog.md` (`CHANGELOG.md` is a symlink to it) is generated by CI from commit messages: do not edit it, write descriptive conventional commits instead. `README.md` and `CONTRIBUTING.md` are symlinks into `book/src/` as well.
