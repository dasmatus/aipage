# Contributing to AIPage

Thank you for your interest in contributing. This page covers the toolchain, the layout of the repository and how to validate a change before opening a pull request.

## Prerequisites

- A Rust toolchain with the `wasm32-unknown-unknown` target (`rustup target add wasm32-unknown-unknown`).
- `wasm-bindgen-cli` in **exactly** the version of the `wasm-bindgen` crate pinned in `Cargo.lock` (`cargo install wasm-bindgen-cli --version <x.y.z>`); the CLI refuses a `.wasm` built with another crate version.
- `wasm-opt` from [binaryen](https://github.com/WebAssembly/binaryen) (optional; without it the build skips size optimisation).
- [Bun](https://bun.sh/) for the Sass/PostCSS CLIs, Playwright and `web-ext`.

The easiest way to get all of that is the Nix flake: `nix develop` provides the pinned toolchain, and CI runs every step inside it.

```bash
git clone https://github.com/dasmatus/aipage.git
cd aipage
bun install
```

## Repository layout

```
crates/
  aipage-bindings/   # bindings to the chrome.* API, Direct/Bridge transport, JSON helpers
  aipage-core/       # shared logic: types, storage, i18n, providers, agent loop, imagegen, markdown
  aipage-sidebar/    # Leptos sidebar UI (wasm)
  aipage-background/ # CORS proxy, web search, toolbar toggle, update check (wasm)
  aipage-content/    # navbar button, sidebar iframe, hosted-UI bridge, theming, exam tools (wasm)
xtask/               # build orchestrator: cargo → wasm-bindgen → wasm-opt → CSS → dist-<target>/
assets/              # manifests, sidebar.html, JS loaders, anti_cheat.js, stylesheets, vercel.json
tests/install/       # Playwright install tests against the built dists
tests/e2e/           # Playwright UI tests against dist-chrome served over HTTP
book/src/            # this documentation (mdBook); README.md, CONTRIBUTING.md and CHANGELOG.md are symlinks into it
```

## Building

```bash
cargo run -p xtask -- build --target chrome   # or firefox / safari → dist-<target>/
cargo run -p xtask -- build-all               # all three browsers
cargo run -p xtask -- build --target web      # the hosted sidebar only → dist-web/
```

`bun run build:chrome` / `build:firefox` / `build:safari` / `build:all` are aliases. A nightly-style manifest version is stamped with `--version-stamp 1.7.0.20261006 --version-name "1.7.0-nightly.20261006+abc1234"` (1–4 dot-separated integers, no leading zeros, at most nine digits each; `version_name` is written for Chrome only).

Load `dist-chrome/` unpacked, `dist-firefox/` as a temporary add-on, or wrap `dist-safari/` with `scripts/setup-safari.sh` on macOS. Current Chrome/Chromium (153+) no longer loads Manifest V2 extensions at all; use a Chromium ≤ 141-era build with `--disable-features=ExtensionManifestV2Disabled,ExtensionManifestV2Unsupported`, or a browser that still allows MV2.

## Testing

```bash
cargo test --workspace                                   # native unit tests
cargo clippy --workspace --all-targets -- -D warnings    # lint (CI fails on warnings)
cargo check --target wasm32-unknown-unknown -p aipage-sidebar -p aipage-background -p aipage-content

cargo run -p xtask -- build-all
bun run test:install          # install tests: real unpacked install in Chromium, web-ext lint + temporary
                              # install in Firefox (when a binary is available), structural check of all dists
bun run test:e2e              # Playwright UI tests (serves dist-chrome with a mocked chrome.*)
```

See `tests/install/README.md` and `tests/e2e/README.md` for details. The Playwright scripts are prefixed with `env -u LD_PRELOAD` because Chromium/Firefox crash under secureblue's hardened allocator; elsewhere that prefix is a no-op.

## Documentation

The book is built with [mdBook](https://rust-lang.github.io/mdBook/): `bun run docs:build` (`mdbook build`) or `bun run docs:serve`.

## Submitting changes

1. Create a branch from `main` (`feat/...` or `fix/...`); never commit to `main` directly.
2. Use [conventional commit](https://www.conventionalcommits.org/) messages; the changelog sections are derived from the type (`feat`, `fix`, `refactor`, `docs`, `ci`, `build`, `chore`, ...).
3. Run the tests and lint above. Storage keys, the serialized `ProviderType` strings and the bridge wire format are persisted contracts; do not rename them.
4. Add a line to the *Unreleased* section of `book/src/changelog.md`.
5. Open a pull request against `main` describing the change and linking any related issue.

## Reporting issues

Please open an issue on the [GitHub issue tracker](https://github.com/dasmatus/aipage/issues) with steps to reproduce, the browser and extension version, and anything printed in the browser console.
