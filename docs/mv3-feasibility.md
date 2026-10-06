# Manifest V3 feasibility study

Status: **decision-ready, backed by a working prototype** (2026-10-06).
Scope: the Chrome build. Firefox and Safari are assessed but unchanged.

## Summary

Current Chrome (Chromium 153, the build Playwright 1.63 ships) refuses to load
our Manifest V2 extension at all, even unpacked with `--load-extension`; the
feature flags and the enterprise policy that used to re-enable MV2 no longer
exist in that binary. Chromium 141 and Brave 1.96 still load MV2. The Chrome
build therefore no longer installs on a current Chrome, and the window in which
Brave still accepts it is closing.

The prototype in this branch (`cargo run -p xtask -- build --target chrome-mv3`
→ `dist-chrome-mv3/`) is a Manifest V3 build of the **same three WASM
modules**: only the manifest, the background bootstrap and one binding
(`action` vs `browserAction`) differ. It installs and works end to end on
Chromium 153, Chromium 141 and Brave 1.96 — service worker, sidebar under the
stricter MV3 CSP, CORS proxy round-trips from inside the worker, content WASM
on an edupage.org page, and worker wake-up after termination — with no CSP
violations and no `'unsafe-eval'`.

**Recommendation: migrate the Chrome build to MV3** (estimated 2–3 working
days to production quality, see the checklist), keep Firefox and Safari on
MV2 for now, and do not build the planned "download the UI bundle from GitHub
releases and import it via `blob:` URLs" feature for Chrome, because MV3
forbids remotely hosted code in extension contexts.

## What breaks under MV3 and how the prototype addresses it

| MV2 today | Under MV3 | Prototype |
| --- | --- | --- |
| `background.scripts` event page (`background.js` + `background_loader.js`), has `window`/`document` | `background.service_worker`: one classic worker script, no DOM, terminated after ~30 s idle, restarted per event | `assets/background_sw.js`: `importScripts("background.js")` (the wasm-bindgen `--target no-modules` glue works unchanged in a classic worker; no `"type": "module"` needed), then `wasm_bindgen({ module_or_path: chrome.runtime.getURL("background_bg.wasm") })`. |
| Listeners registered whenever the WASM finishes instantiating (asynchronous) | Listeners must be registered **synchronously at top level**, or the event that woke the worker is dropped | The loader registers a real listener for each event the background uses (`runtime.onMessage`, `alarms.onAlarm`, `action.onClicked`, `notifications.onClicked/onButtonClicked`) synchronously, replaces each `addListener` with a function that records the Rust handlers (`Object.defineProperty` works on Chrome's event objects), buffers events until the WASM has booted and replays them. Returning `true` from the early `onMessage` listener keeps `sendResponse` valid across the replay. Verified: a message that wakes a stopped worker is answered; the same test fails with a naive loader (see evidence). |
| Event page lives as long as it wants | Worker is killed after 30 s without extension activity, **even with a `fetch` in flight** (an LLM reply can take longer) | While any `sendResponse` is pending, the loader calls `chrome.runtime.getPlatformInfo` every 20 s, which resets the idle timer (Chrome's documented keepalive), capped at 10 min per message. |
| `chrome.browserAction` | `chrome.action` only | `aipage_bindings::action::on_clicked` resolves `chrome.action`, falling back to `chrome.browserAction`, so one background serves both manifest versions. |
| String CSP with `'unsafe-eval' 'wasm-unsafe-eval'` and a `connect-src` list | `content_security_policy.extension_pages` object; `'unsafe-eval'` is rejected | `"script-src 'self' 'wasm-unsafe-eval'; object-src 'self'"`. Checked that none of the three wasm-bindgen glue files uses `eval`/`new Function`; the sidebar page reported zero `securitypolicyviolation` events while booting the Leptos UI. `connect-src` is unnecessary: only the background fetches external hosts and it is governed by `host_permissions`. |
| Host patterns inside `permissions` | `host_permissions` is a separate key | xtask derives `host_permissions` (and `version`) from `manifest.chrome.json` at build time and refuses to build if the API permission sets of the two manifests differ, so the MV3 manifest cannot drift from the shipped one. |
| Flat `web_accessible_resources` list | `[{ resources, matches }]` | Same list, `matches: ["*://*.edupage.org/*"]`. The content script's `fetch(chrome.runtime.getURL("content_bg.wasm"))` and the `sidebar.html` iframe both work from an edupage.org page. |
| `XMLHttpRequest`, `window`, `document` in the background | Absent in a worker | The background only uses `fetch` (good). `update.rs` reads the user agent via `web_sys::window()`, which is `None` in a worker, so it silently assumes Chrome — correct for the Chrome build, but should move to `navigator.userAgent` on the worker global in the production migration. |
| In-memory state in the background | Lost on every worker termination | Audited `aipage-background` and `aipage-bindings`: no in-memory state survives a request — the proxy and search handlers are request-scoped, the update manager keeps everything in `storage.local` and `alarms`, `TRANSPORT` is a cheap re-detectable cache. `alarms.create` on every start is idempotent. Nothing to persist. |

Not affected: the sidebar (an extension page in an iframe; CSP aside, MV3
changes nothing), the content script, `aipage-core`, the hosted-UI bridge (a
web page in an iframe inside the EduPage DOM is not extension-context code).

## Test evidence

All commands run from the repository root after `bun install --frozen-lockfile`;
no `LD_PRELOAD` was set in this environment (the `bun run` scripts strip it).
Browsers: Chromium 153 = Google Chrome for Testing 153.0.8010.12 (Playwright
build 1243); Chromium 141 = Chromium 141.0.7390.37 (Playwright build 1194);
Brave = Brave Browser 154.1.96.61 (Chromium 154 base).

Build:

```bash
cargo run -p xtask -- build --target chrome-mv3   # dist-chrome-mv3/
cargo run -p xtask -- build --target chrome       # dist-chrome/ (MV2, for comparison)
```

MV3 prototype (`tests/install/mv3.spec.ts`, opt-in via `AIPAGE_MV3=1`;
`AIPAGE_MV2_EXPECT` asserts what the *shipped* MV2 build does on the same binary):

```bash
AIPAGE_MV3=1 AIPAGE_MV2_EXPECT=reject CHROMIUM_EXECUTABLE=<chromium-153> bunx playwright test -c playwright.install.config.ts mv3
AIPAGE_MV3=1 AIPAGE_MV2_EXPECT=load   CHROMIUM_EXECUTABLE=<chromium-141> bunx playwright test -c playwright.install.config.ts mv3
AIPAGE_MV3=1 AIPAGE_MV2_EXPECT=load   CHROMIUM_EXECUTABLE=<brave>        bunx playwright test -c playwright.install.config.ts mv3
```

Shipped MV2 build on Chromium 153 through the existing spec (expected failure):

```bash
CHROMIUM_EXECUTABLE=<chromium-153> bunx playwright test -c playwright.install.config.ts chromium.spec
# ✘ "no chrome-extension:// background_page target: the MV2 extension did not load"
```

Control for the listener shim: the same dist with a three-line loader that
only does `importScripts` + `wasm_bindgen(...)` (no synchronous listeners):

```bash
AIPAGE_MV3=1 AIPAGE_MV3_DIST=<copy-with-naive-loader> CHROMIUM_EXECUTABLE=<chromium-153> \
  bunx playwright test -c playwright.install.config.ts mv3 -g "wakes a stopped"
```

What the MV3 spec asserts: (1) the extension installs with **no** MV2 flags
and a `chrome-extension://<id>/background_sw.js` `service_worker` target
appears (and no `background_page`); (2) `chrome://extensions-internals` lists
it enabled, `manifest_version: 3`, no disable reasons; (3) the loader's shim
is in place (`addListener.name === "record"` on the three events); (4)
`sidebar.html` boots the sidebar WASM (`aipage sidebar wasm loaded`), Leptos
renders into `#root`, zero CSP violations / page errors / console errors in
the page and in the worker; (5) `proxy_fetch` answers both the validation
reply `{ok:false,error:"Missing url"}` and a real GET to a local
`http://127.0.0.1:<port>/ping` server with `{ok:true,status:200,data:{...}}`,
i.e. a `fetch` executed inside the service worker; (6) a stand-in
`https://www.edupage.org/` page (served by a Playwright route) gets the
content script, which fetches and instantiates `content_bg.wasm` through
`web_accessible_resources` (`[AIPage] Content script loaded and active`);
(7) after `ServiceWorker.stopAllWorkers` the worker target is gone, a
`runtime.sendMessage` from `sidebar.html` wakes it and is answered.

### Results

| Browser | MV3 prototype (`mv3.spec.ts`, tests 1–3) | Shipped MV2 `dist-chrome` on the same binary |
| --- | --- | --- |
| Chromium 153 (Chrome for Testing 153.0.8010.12) | **pass** (3/3) | **rejected** — not installed, no background page (`chromium.spec.ts` fails; `mv3.spec.ts` matrix test: `REJECTED`) |
| Chromium 141 (141.0.7390.37) | **pass** (3/3) | loads (with the MV2 feature flags; matrix test: `LOADS`) |
| Brave 1.96 (154.1.96.61) | **pass** (3/3) | loads (with the MV2 feature flags; matrix test: `LOADS`) |

Control (Chromium 153, naive loader without the synchronous listener shim,
wake-up test only): **fails** as expected — `page.evaluate: Error: Could not
establish connection. Receiving end does not exist.` The worker was started
by the message, but its `onMessage` listener was registered only after the
asynchronous WASM instantiation, so Chrome found no receiver. With the shim
the same message is answered in ~0.5 s. The shim is load-bearing, not
defensive.

Default install run without `AIPAGE_MV3`: the MV3 spec is skipped, so the
existing gate (`bun run test:install`) is unchanged.

Native validation on this branch: `cargo test --workspace` (all green,
including three new xtask tests for the manifest derivation),
`cargo clippy --workspace --all-targets -- -D warnings` (clean),
`cargo check --target wasm32-unknown-unknown` for the three wasm crates (clean).

### Gaps in the evidence

- The content-script check runs against a stand-in page served by a Playwright
  route, not the real EduPage DOM; it proves resource access and WASM
  instantiation, not the navbar injection (that is the e2e suite's job and is
  unaffected by the manifest version).
- The toolbar `action.onClicked` → `toggle_sidebar` path and the
  `notifications`/`downloads` paths are not exercised (same as for MV2 today).
- Idle termination during a long `proxy_fetch` was reasoned from Chrome's
  documented lifetime rules and mitigated with the documented keepalive; it was
  not reproduced with a 30 s+ upstream in the harness (needs a slow test server
  and ~60 s per run; worth adding before shipping).
- Headless, Linux, unpacked. Not tested: Web Store packaging, Windows/macOS.

## Firefox and Safari

Could one MV3 manifest serve all three? Not cleanly.

- **Firefox** supports MV3 (109+) but its background is an **event page**
  (`background.scripts`, optional `"persistent": false`), not a service worker;
  `background.service_worker` is ignored. Firefox also requires
  `browser_specific_settings.gecko.id`, and its MV3 host permissions are
  **optional by default** (granted at runtime, not at install), which would
  break the CORS proxy and the EduPage content script until the user opts in
  (`optional_host_permissions` / `permissions.request` UX, or
  `data_collection_permissions` for AMO). Its `web_accessible_resources` and
  `action` keys match Chrome's MV3 shape. Chrome accepts a manifest with *both*
  `background.service_worker` and `background.scripts` (it ignores `scripts`;
  Firefox ignores `service_worker`), so a single file is technically possible
  but it would carry Firefox-only keys that Chrome warns about and Chrome-only
  semantics Firefox silently changes. Firefox has **no MV2 deprecation
  timeline**; staying MV2 there is fine.
- **Safari** (16.4+) supports MV3 with either a service worker or an event
  page, but still accepts MV2, and the Xcode converter currently wraps
  `dist-safari` as is. MV3 there would need the same `'wasm-unsafe-eval'`
  CSP (supported since Safari 16.4) and the `action` key, and macOS/iOS
  testing we cannot do in CI. No pressure to move.

What xtask would have to emit per target if everything moved to MV3: one
shared body (`permissions`, `host_permissions`, `content_scripts`,
`web_accessible_resources`, `action`, CSP), plus per target `background`
(`service_worker` for Chrome/Safari, `scripts` for Firefox) and
`browser_specific_settings` for Firefox; the current `derive_mv3_manifest`
already shows the pattern (derive from one source, validate, write per
target). **Recommendation:** Chrome → MV3 now; Firefox and Safari stay on the
MV2 manifests, keeping `background_loader.js`. The Rust code is already
manifest-agnostic after the `action`/`browserAction` binding change.

## Production migration checklist

| # | Item | Effort |
| --- | --- | --- |
| 1 | Promote: `manifest.chrome-mv3.json` → `manifest.chrome.json`, `background_sw.js` → the Chrome loader, drop the MV2 Chrome manifest, keep the derivation test logic as a structural test, add `chrome-mv3` → `chrome` in `build-all`, packaging and CI | 0.5 d |
| 2 | Update `tests/install/chromium.spec.ts` to look for a `service_worker` target and `manifest_version: 3`; drop `CHROMIUM_MV2_ARGS` and the Chromium 141 pin; keep the Brave run; make `structure.spec.ts` accept MV3 for Chrome (`web_accessible_resources` object form, `background.service_worker`, object CSP) | 0.5 d |
| 3 | Move the listener shim's keepalive and buffering from JS into Rust where possible (export a `handle_message` from the background crate; `background_sw.js` then registers plain listeners that `await` the init promise), or keep the shim and add a unit-testable JS file; either way add a slow-upstream test for the >30 s `proxy_fetch` case | 1 d |
| 4 | `update.rs`: read `navigator.userAgent` from the worker global instead of `web_sys::window()`; make `alarms.create` conditional on `alarms.get` to avoid resetting the period on every worker start (cosmetic) | 0.25 d |
| 5 | Decide the host-permission policy: MV3 Chrome grants `host_permissions` at install for sideloads and the Web Store, but shows them as a warning; keep the list minimal (drop `localhost`/`127.0.0.1` from release builds?) | 0.25 d |
| 6 | Docs: CLAUDE.md "Manifest V2" constraint, `tests/install/README.md`, user guide install steps (no more MV2 flags on Chrome) | 0.25 d |
| 7 | Optional: Web Store listing (MV3 is required there); otherwise sideload/`--load-extension` and Brave stay the distribution path | 0.5 d + review time |

Total: roughly 2–3 working days plus review.

## Risks

- **Service-worker lifetime vs long proxy requests.** Every LLM call is one
  `proxy_fetch` from the sidebar; the agent loop issues several in a turn and a
  single completion can exceed 30 s. The keepalive in the loader mitigates it
  (documented and widely used), but it is a heuristic: if Chrome tightens the
  rules, long requests fail with "The message port closed before a response
  was received". Fallback designs: move the fetch into the sidebar page where
  possible (not possible for CORS-restricted hosts), or stream through a
  `runtime.connect` port, which also keeps the worker alive (Chrome 114+).
- **Update-manager alarms.** `alarms` survive worker termination and wake it,
  so the hourly check keeps working; the alarm listener must stay in the
  synchronous shim list (it is). `notifications.onClicked` likewise.
- **Transient state.** None today; any future background cache (sessions,
  rate-limit state) must go to `storage.session`/`storage.local`.
- **Distribution.** MV3 is mandatory on the Chrome Web Store and now for
  sideloading on current Chrome; MV2 remains only on Brave (and other forks)
  for an unknown time. Shipping MV3 for Chrome loses nothing on Brave (the
  prototype loads there).
- **`'wasm-unsafe-eval'` per browser.** Chrome 103+, Firefox 102+, Safari
  16.4+ accept it; all are below our minimums. MV3 forbids `'unsafe-eval'`,
  which we do not need (verified).
- **Remote code.** MV3 forbids executing remotely hosted code in extension
  contexts (`blob:`/`data:` imports of downloaded scripts included). The
  planned "download the UI bundle from GitHub releases and import it via
  `blob:` URLs" feature is therefore **MV2-only** and would be a Web Store
  rejection reason; on Chrome it must stay the current design (hosted UI as a
  web page in an iframe, or a full extension update). The Codeberg/GitHub
  release notifier that downloads a zip for manual install is unaffected.
- **Firefox divergence.** Keeping Firefox on MV2 means two manifest shapes
  and two background loaders in the repo indefinitely; the shared Rust code is
  unaffected.

## Recommendation

Migrate the Chrome build to Manifest V3 using this prototype as the base; the
MV2 Chrome build no longer installs on current Chrome, and the prototype
already passes the full install check on Chromium 141, 153 and Brave with
the same WASM. Keep Firefox and Safari on their MV2 manifests (no deprecation
pressure, different background model). Treat the GitHub-releases `blob:`
import feature as MV2-only and do not plan it for Chrome.
