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

The book is built with [mdBook](https://rust-lang.github.io/mdBook/) (in the Nix devShell): `bun run docs:build` (`mdbook build` → `book/book/`, plus the `vercel.json` for hosting) or `bun run docs:serve`. It is published at **<https://aipage-docs.vercel.app>** by `.github/workflows/deploy-docs.yml` on every push to `main` that touches `book/**` or `book.toml` (and after each changelog regeneration).

## Submitting changes

1. Create a branch from `main` (`feat/...` or `fix/...`); never commit to `main` directly.
2. Use [conventional commit](https://www.conventionalcommits.org/) messages: `type(scope): subject`. The changelog is generated from them, so the subject line is what users will read; the type picks the section (`feat` → Features, `fix` → Bug Fixes, `perf`, `refactor`, `ci`, `test`, `build`, `docs`, `style`, `chore`; `deps(...)` → Dependencies) and non-conventional subjects are left out.
3. Run the tests and lint above. Storage keys, the serialized `ProviderType` strings and the bridge wire format are persisted contracts; do not rename them.
4. Do **not** edit `book/src/changelog.md` (`CHANGELOG.md`): it is generated (see below) and CI rejects pull requests that touch it.
5. Open a pull request against `main` describing the change and linking any related issue.

## Changelog

`book/src/changelog.md` (`CHANGELOG.md` is a symlink to it) is **generated — never edit it by hand**. [git-cliff](https://git-cliff.org) renders it from the conventional commit history with the format in `cliff.toml`; `.github/workflows/changelog.yml` regenerates it on every push to `main` and commits the result as `docs(changelog): regenerate [skip ci]` (as `github-actions[bot]`, with the repository's `GITHUB_TOKEN`), and `ci.yml` fails a pull request that changes the file (unless the pull request also changes `cliff.toml` / `scripts/changelog.sh`, i.e. regenerates it). Commits after the latest `vX.Y.Z` tag render under *Unreleased*; each tag gets a `## [X.Y.Z](compare link) (date)` section.

- `bun run changelog` (`scripts/changelog.sh`) regenerates the file locally for a preview; running it twice yields the same file (it depends only on the commit graph and `cliff.toml`, so it is deterministic — no timestamps for unreleased commits).
- The generated part starts after the commit that released 1.5.0 (`34c5b38`, the boundary is set in `scripts/changelog.sh`). The sections for 1.5.0 and older were written by standard-version before the move to GitHub and are frozen verbatim in the `footer` of `cliff.toml`.
- Merge commits, `chore(release):` and `docs(changelog):` commits are skipped; `(#123)` references are linked.

## Releasing

1. On `main`, bump the version in the four places that carry it: `Cargo.toml` (`[workspace.package] version`), `assets/manifest.chrome.json`, `assets/manifest.firefox.json`, `assets/manifest.safari.json` and `package.json`, and commit (`chore(release): X.Y.Z` — that commit is excluded from the changelog).
2. Tag it and push the tag: `git tag vX.Y.Z && git push origin main vX.Y.Z`.
3. The pushed `v*` tag runs `.github/workflows/release.yml`: it builds and packages all three targets and creates the GitHub release with the assets; the release body is this tag's changelog section, rendered by `scripts/changelog.sh --release vX.Y.Z` (the commits since the previous `v*` tag).
4. `changelog.yml` then regenerates `book/src/changelog.md` on `main`, where the commits now appear under `## [X.Y.Z]`, and redeploys the book. Nothing is edited by hand at any step.

## Reporting issues

Please open an issue on the [GitHub issue tracker](https://github.com/dasmatus/aipage/issues) with steps to reproduce, the browser and extension version, and anything printed in the browser console.
