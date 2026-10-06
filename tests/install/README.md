# Extension install tests

Install tests load the **built** `dist-*/` directories the way a browser
would, instead of serving `sidebar.html` over HTTP with a mocked `chrome.*`
like the [e2e suite](../e2e/README.md). They answer one question per target:
"does this build install and boot in the real extension runtime?"

They run in CI as a hard gate (`.github/workflows/build.yml`, used by `ci.yml`
and `nightly.yml`); a failing install test blocks the nightly pre-release.

## Running

```bash
cargo run -p xtask -- build-all       # the tests fail (not skip) on a missing dist
bun run test:install                  # everything
bun run test:install:chromium         # one spec: chromium | firefox | structure
```

Environment knobs:

| Variable              | Effect                                                                                                     |
| --------------------- | ---------------------------------------------------------------------------------------------------------- |
| `CHROMIUM_EXECUTABLE` | Use this Chromium binary instead of Playwright's `chromium` channel (e.g. when the installed browser revision does not match the Playwright version). |
| `FIREFOX_BIN`         | Firefox binary for the temporary-install smoke test; defaults to `firefox` on `PATH`. Without one the smoke test is skipped (lint still runs). |
| `PLAYWRIGHT_BROWSERS_PATH` | Standard Playwright browser cache location.                                                           |

The config is `playwright.install.config.ts` (sequential, no web server).
Like the e2e scripts, `test:install` is prefixed with `env -u LD_PRELOAD`
because Chromium/Firefox crash under secureblue's hardened allocator.

## What each spec checks

### `chromium.spec.ts` — real unpacked MV2 install

Launches headless Chromium (`channel: 'chromium'`, i.e. the full browser in
new headless mode; the headless shell cannot load extensions) with
`--disable-extensions-except` / `--load-extension` pointing at `dist-chrome`,
plus the flags that still allow a Manifest V2 extension to load:

```
--disable-features=ExtensionManifestV2Disabled,ExtensionManifestV2Unsupported
--enable-features=AllowLegacyMV2Extensions
```

Verified empirically on Chromium 141: with neither flag the extension is not
installed at all (missing from `chrome://extensions-internals`); either flag
alone is sufficient, and Chromium ignores unknown feature names, so both are
passed for robustness. Chromium 153 (the "Chrome for Testing" build bundled
with Playwright 1.63) refuses to load MV2 extensions entirely, even unpacked
with `--load-extension`: those features, `AllowLegacyMV2Extensions` and the
`ExtensionManifestV2Availability` policy no longer exist in that binary (MV3
extensions load fine), so CI pins this spec to Chrome 141 and the Chrome
build only installs on browsers that still allow MV2. Brave 1.96 (Chromium
154 base) still does: the spec passes there unchanged, and CI runs it a second
time with `CHROMIUM_EXECUTABLE` pointing at the latest stable Brave `.deb`
from Brave's apt repository (extracted with `dpkg-deb -x`, no install). Then:

1. finds the extension's `_generated_background_page.html` target through CDP
   `Target.getTargets` (Playwright ≥ 1.5x no longer attaches to MV2
   background pages, so `context.backgroundPages()` is always empty) and
   derives the extension id from its URL;
2. asserts `chrome://extensions-internals` lists it as enabled, MV2,
   `COMMAND_LINE` location, no disable reasons;
3. opens `chrome-extension://<id>/sidebar.html`, waits for the
   `aipage sidebar wasm loaded` console line and for Leptos to render into
   `#root`;
4. sends `{action: "proxy_fetch"}` to the background and expects the Rust
   handler's `{ok: false, error: "Missing url"}` reply — proof that the
   background WASM instantiated and registered `runtime.onMessage`;
5. fails on any uncaught page error, CSP violation
   (`securitypolicyviolation`) or console error originating from the
   extension origin (remote resource failures such as Google Fonts are
   tolerated, sandboxes may be offline).

Two more scenarios cover the self-updating sidebar bundle and run only when
`dist-web/aipage-web.json` exists (`cargo run -p xtask -- build --target web`):

6. seeds the extension origin's IndexedDB (`aipage-ui-bundle` / `ui-bundle`)
   with the just-built `dist-web` files exactly as the background's
   `ui_bundle::sync` writes them, turns `ui_bundle_update_enabled` on and
   reloads `sidebar.html`: the loader must report `loaded from the
   downloaded GitHub bundle`, boot the wasm, render into `#root`, attach
   `blob:` stylesheets and disable the bundled ones, with no CSP violation —
   proof that `blob:` module imports work under the extension CSP;
7. seeds the same bundle with one corrupted file: the loader must warn about
   the sha256 failure, boot the **bundled** UI instead and clear the store.

The real download path (GitHub release → IndexedDB) is not exercised here;
no network is needed.

### `firefox.spec.ts` — lint + temporary install

- `web-ext lint` (addons-linter) on `dist-firefox` must report **zero
  errors** (warnings are reported as a test annotation).
- The same lint on the packaged xpi: `aipage-firefox.xpi` at the repo root,
  else the newest `packages/*.zip|xpi`, else one is built into a temp dir.
- If a Firefox binary is available, `web-ext run` installs `dist-firefox` as
  a temporary add-on in headless Firefox through the remote debugging
  protocol; the promise only resolves after the install succeeded. The test
  is **skipped with a visible reason** when no binary is found.

### `structure.spec.ts` — all three dists (the only check possible for Safari on Linux)

For `dist-chrome`, `dist-firefox` and `dist-safari`: the manifest parses and
is MV2, the `version` matches the shared Chrome/Firefox/Safari format
(1–4 dot-separated integers, no leading zeros, ≤ 9 digits), every file the
manifest references exists, the three `*_bg.wasm` modules start with the wasm
magic and have their glue and loader files, `sidebar.html` contains no inline
script / inline handler / `javascript:` URL (the extension CSP would block
them) and only references bundled files, the CSP allows `blob:` scripts and
the GitHub hosts the update manager needs (and no Codeberg), Firefox has a
gecko id, non-Chrome manifests carry no `version_name`, and all dists share
one version.

When `dist-web/` exists, `aipage-web.json` is checked against it: every
listed file exists with the listed size and sha256, exactly one hashed glue
js and one wasm are listed, and every published file (except `vercel.json`
and the manifest itself) is listed.

## Nightly version stamps

`cargo run -p xtask -- build-all --version-stamp 1.7.0.20261006 --version-name "1.7.0-nightly.20261006+abc1234"`
rewrites the manifest `version` (validated in xtask) and, for Chrome only,
`version_name`. Chromium accepts the 8-digit date component for unpacked
loads (the 65535-per-component limit is a Chrome Web Store rule) and
addons-linter accepts up to nine digits per component, both checked
empirically; the install tests assert the format.
