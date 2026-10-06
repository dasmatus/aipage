# AIPage Extension

A cross-browser extension for Chrome, Firefox, and Safari that adds an AI-powered sidebar to EduPage, featuring a clean interface and integration with multiple AI providers.

## Features

- AI chat assistant integrated directly into EduPage
- **Multi-Browser Support**: Works on Chrome, Firefox, and Safari
- Clean, responsive design that matches EduPage's aesthetic
- Chat with Ollama Cloud, OpenRouter, ChatGPT / OpenAI or Claude (Anthropic), or with a local LM Studio / Ollama
- Secure local storage of API credentials
- Responsive sidebar that doesn't obscure important UI elements
- **Anti-Cheat Protection**: Automatically blocks tab switch and copy-paste detection during tests
- **Smart System Prompt**: Ensures the AI acts as a helpful assistant that answers correctly

## Installation

To install the extension, download the latest build directly from our GitHub Releases (every pushed `v*` tag triggers the GitHub Actions release workflow, which builds all three targets and attaches them as release assets).

1.  Visit the [GitHub Releases](https://github.com/dasmatus/aipage/releases) page.
2.  Open the latest release.
3.  Download the asset for your browser:
    - **Chrome**: `aipage-chrome.zip`
    - **Firefox**: `aipage-firefox.xpi` (signed by addons.mozilla.org, installs permanently) — a release built without AMO credentials carries `aipage-firefox-unsigned.xpi` instead, which Firefox only loads as a temporary add-on
    - **Safari**: `aipage-safari-macos.zip` (the `AIPage.app` wrapper Safari needs, unsigned) — `aipage-safari.zip` is the bare web extension for wrapping it yourself with Xcode

### Chrome

1.  Download `aipage-chrome.zip` from the release.
2.  Unzip the file to a folder on your computer.
3.  Open Chrome and navigate to `chrome://extensions/`.
4.  Enable **"Developer mode"** (toggle in the top-right corner).
5.  Click **"Load unpacked"**.
6.  Select the unzipped folder.

> **Note on Manifest V2**: the extension is a Manifest V2 extension. Current Chrome/Chromium (153 and later) no longer loads MV2 extensions at all, not even unpacked: the `ExtensionManifestV2Disabled`/`ExtensionManifestV2Unsupported` features, `AllowLegacyMV2Extensions` and the `ExtensionManifestV2Availability` enterprise policy no longer exist in those builds. **Brave** (1.96, Chromium 154 base) still loads it: the real-install test passes there, and CI runs that test on both the latest stable Brave and Chromium 141. The Chrome build is only installable on Chromium builds up to the 141 era (started with `--disable-features=ExtensionManifestV2Disabled,ExtensionManifestV2Unsupported`) or on browsers that still allow MV2, such as **[Brave](https://brave.com/)**. An MV3 manifest for Chrome is the pending fix.

### Firefox

Release builds of Firefox only keep extensions that Mozilla has signed. The release workflow signs `aipage-firefox.xpi` through addons.mozilla.org's *self-distribution* (unlisted) channel — the add-on is not listed on AMO, but the file carries Mozilla's signature.

1.  Download `aipage-firefox.xpi` from the release.
2.  Open it in Firefox: drag it onto a Firefox window, or **File → Open File…**, or `about:addons` → gear icon → **Install Add-on From File…**.
3.  Confirm the **Add** prompt. The extension stays installed across restarts (Firefox 140 or newer; 142 on Android).

If the release only has `aipage-firefox-unsigned.xpi` (built without AMO credentials, e.g. from a fork), Firefox refuses to install it permanently. Load it as a temporary add-on instead: `about:debugging#/runtime/this-firefox` → **Load Temporary Add-on…** → pick the `.xpi`. Temporary add-ons are removed when Firefox exits. (Firefox Developer Edition / Nightly can install unsigned files permanently after setting `xpinstall.signatures.required` to `false` in `about:config`.)

### Safari (macOS only)

Safari does not load bare web extensions: they must ship inside a native macOS app. The release's `aipage-safari-macos.zip` contains that app (`AIPage.app`), built by Apple's `safari-web-extension-packager` on a macOS runner from the same files as the other packages. It is **not code-signed or notarized** (that needs an Apple Developer account), so Safari treats it as a developer build:

1.  Download `aipage-safari-macos.zip` from the release and unzip it; move `AIPage.app` to *Applications* (or anywhere permanent — Safari remembers the location).
2.  Open the app once: right-click (Control-click) `AIPage.app` → **Open** → **Open** again in the Gatekeeper dialog (a plain double-click is refused for unsigned apps). The app window only tells you to enable the extension; you can close it afterwards.
3.  In Safari, allow unsigned extensions: **Safari → Settings → Advanced** → tick **Show features for web developers** (Safari 16 and earlier: *Show Develop menu in menu bar*), then **Settings → Developer** → tick **Allow unsigned extensions** (Safari 16 and earlier: **Develop → Allow Unsigned Extensions**). Safari resets this switch every time it quits — set it again after a restart or the extension stays disabled.
4.  **Safari → Settings → Extensions** → enable **AIPage** and grant it access to `edupage.org` when asked.

`aipage-safari.zip` is the bare web-extension folder. Use it to build the wrapper yourself with Xcode (`scripts/setup-safari.sh`, see [Packaging for Distribution](#packaging-for-distribution)), for example to sign it with your own developer certificate.

## Nightly builds

Every night (and on demand) the head of `main` is built for all three browsers and published to a single rolling pre-release:

**<https://github.com/dasmatus/aipage/releases/tag/nightly>**

- The release is re-created in place: the `nightly` tag moves to the built commit, the assets (`aipage-chrome.zip`, `aipage-firefox.xpi` or `aipage-firefox-unsigned.xpi`, `aipage-safari.zip`, `aipage-safari-macos.zip`) are replaced, and the notes list the commits since the previous nightly. `nightly.json` records the exact commit the assets were built from, the asset names and whether the Firefox xpi was signed (`firefox_signed`).
- The manifest version is stamped as `<base>.<YYYYMMDD>` (for example `1.7.0.20261006`), so a nightly sorts above the release it is based on and below the next release. Chrome additionally shows the human-readable `version_name` (`1.7.0-nightly.20261006+<sha>`).
- Nothing is published when `main` has not changed since the last nightly, and a nightly whose extension install tests fail is never published.
- Nightlies are development builds of whatever is on `main` — including half-finished features. The Chrome and Safari packages are unsigned (unpacked install / unsigned-extension mode); the Firefox xpi is signed by AMO like a release when the repository has the AMO credentials configured (see [Firefox signing (AMO)](#firefox-signing-amo)), each nightly being its own AMO version.

### Installing a nightly

**Chrome / Chromium / Brave** — unzip `aipage-chrome.zip`, open `chrome://extensions/`, enable **Developer mode** and **Load unpacked** the folder. Chromium 153 and later refuse to load Manifest V2 extensions entirely (the MV2 feature flags and policy are gone from those builds). On a Chromium build up to the 141 era start the browser with

```
--disable-features=ExtensionManifestV2Disabled,ExtensionManifestV2Unsupported
```

(or enable the `AllowLegacyMV2Extensions` feature, exposed as *Allow legacy extension manifest versions* in `chrome://flags` on builds that still have it). This is exactly what the install tests do in CI, pinned to Chrome 141; Brave keeps MV2 support without any flag.

**Firefox** — `aipage-firefox.xpi` is AMO-signed: open it in Firefox and confirm **Add**; it installs permanently and each night's build is a higher version than the last, so opening the next nightly upgrades in place. When the nightly only offers `aipage-firefox-unsigned.xpi`, open `about:debugging#/runtime/this-firefox`, choose **Load Temporary Add-on…** and pick the file (removed when Firefox exits).

**Safari (macOS)** — unzip `aipage-safari-macos.zip`, open `AIPage.app` once (right-click → **Open**, it is unsigned), switch on **Allow unsigned extensions** in Safari's Developer settings and enable AIPage under **Settings → Extensions**, exactly as for a [release](#safari-macos-only). `aipage-safari.zip` is the bare extension for wrapping it yourself with `scripts/setup-safari.sh`. Safari cannot run on Linux: the Linux job checks the Safari dist structurally and the macOS job proves that Apple's packager and `xcodebuild` accept it, but nobody clicks through the extension before it is published.

## Setting Up Your AI Provider

The extension supports multiple AI providers. Choose your preferred provider and configure the corresponding API key.

### Supported Providers

- **Ollama Cloud** — chat, agentic tools, native web search, and SVG image generation
- **OpenRouter** — the same feature set over any OpenRouter model (`vendor/model` ids)
- **ChatGPT / OpenAI** — the same feature set over the public OpenAI API (`gpt-*` models, API key)
- **Claude (Anthropic)** — chat, agentic tools, native web search (Claude's built-in search tool) and SVG image generation over the Anthropic Messages API
- **LM Studio** (Local)
- **Ollama** (Local)

### Step 1: Choose Your Provider

1. Navigate to any EduPage site (e.g., `https://yourschool.edupage.org`)
2. Click the **AI button** (star icon with the AI text) in the EduPage navbar
3. The sidebar will open showing the settings view
4. Select your preferred AI provider from the dropdown

### Step 2: Configure Your Provider

#### Claude (Anthropic)

Talks directly to Claude through the official Anthropic Messages API (`https://api.anthropic.com`), billed to your Anthropic account.

1. Go to **[the Anthropic Console](https://console.anthropic.com)** and sign in (or create an account).
2. Open **Settings → API Keys** (direct link: `https://console.anthropic.com/settings/keys`).
3. Click **Create Key**, give it a name, and copy it — the key starts with `sk-ant-`.
4. In the AIPage settings pick **Claude (Anthropic)** as the engine, leave the **Base URL** at `https://api.anthropic.com` (only change it for a gateway that speaks the Messages API) and paste the key.
5. Click the refresh button next to **Model** to list your available models and pick one; the default is `claude-opus-5-5`.

> The key is stored locally in your browser and is only ever sent to `api.anthropic.com` (through the extension's background proxy). Claude runs the **agentic chat** tools (read the page, read / fill the exam question) and powers **web search** with its built-in server-side search tool, so no extra search key is needed. **Image generation** asks Claude for an SVG that the extension rasterizes to a PNG in-browser. If you used the Claude provider in an older AIPage release, your saved key and model are picked up again.

#### OpenRouter

OpenRouter exposes hundreds of models (OpenAI, Anthropic, Google, Meta, Mistral, ...) behind one OpenAI-compatible API, billed per request to your OpenRouter account.

1. Go to **[openrouter.ai](https://openrouter.ai)** and sign in (or create an account).
2. Open **[Keys](https://openrouter.ai/keys)**, click **Create Key** and copy it — the key starts with `sk-or-v1-`.
3. In the AIPage settings pick **OpenRouter** as the engine, leave the **Base URL** at `https://openrouter.ai/api` (entering `https://openrouter.ai/api/v1` works too) and paste the key.
4. Click the refresh button next to **Model** to list the available models and pick one, e.g. `openai/gpt-4.1-mini` (the default). Models that support function calling also power the agentic chat, native web search and SVG image generation.

> The key is stored locally in your browser and is only ever sent to `openrouter.ai` (through the extension's background proxy). Requests carry the optional `HTTP-Referer`/`X-Title` attribution headers so OpenRouter can show AIPage on its app rankings.

#### ChatGPT / OpenAI

The public OpenAI platform API (the models behind ChatGPT), billed per request to your OpenAI account. This uses an ordinary API key only — there is no "sign in with ChatGPT" flow.

1. Go to **[platform.openai.com](https://platform.openai.com)** and sign in (or create an account and add billing).
2. Open **[API keys](https://platform.openai.com/api-keys)**, click **Create new secret key** and copy it — the key starts with `sk-`.
3. In the AIPage settings pick **ChatGPT / OpenAI** as the engine, leave the **Base URL** at `https://api.openai.com` (entering `https://api.openai.com/v1` works too) and paste the key.
4. Click the refresh button next to **Model** to list your available chat models and pick one, e.g. `gpt-4.1-mini` (the default). The list is filtered to chat-capable families (`gpt-*`, `o*`, `chatgpt-*`); embedding, audio, realtime, image and moderation models are hidden. Function-calling models power the agentic chat, native web search and SVG image generation.

> The key is stored locally in your browser and is only ever sent to `api.openai.com` (through the extension's background proxy).

#### LM Studio (Local)

1. Open LM Studio and start the **Local Inference Server**.
2. Keep the default Port `1234` or update the **Base URL** in the extension settings.
3. Ensure a model is loaded in LM Studio.
4. Enter the **Model Name** if you want to target a specific one.

#### Ollama (Local)

1. Install Ollama and run it (`ollama serve`).
2. Download a model (e.g., `ollama pull llama3`).
3. Enter the **Base URL** (default: `http://localhost:11434`).
4. Enter the **Model Name** (e.g., `llama3`).

### Step 3: Save Settings

1. Paste your API key into the **"API Key"** field
2. Click **"Save Key"**

Your API key is stored locally in your browser and is never sent anywhere except to your selected provider's API when you send messages.

### Step 4: Start Chatting

Once your API key is saved:

- The sidebar will automatically switch to the chat view
- Type your question in the input field at the bottom
- Press Enter or click the send button
- The AI will respond to your queries

### Switching Providers

You can switch between providers at any time:

1. Click the settings icon (gear) in the sidebar header
2. Select a different provider from the dropdown
3. Enter the API key for that provider (if not already saved)
4. Click "Save Key"

Each provider's API key is stored separately, so you can switch between them without re-entering keys.

## Usage

- **Open/Close Sidebar**: Click the AI button (star icon) in the EduPage navbar
- **Change Settings**: Click the settings icon (gear) in the sidebar header
- **Send Messages**: Type in the input field and press Enter or click send

## Hosted UI / Vercel

The sidebar's user interface (the Leptos/WASM app in `sidebar.html`) is also
published as a static site on Vercel. By default the extension loads the
sidebar **from that hosted copy**, so UI fixes and features ship the moment
they are deployed — without reinstalling or updating the extension. The
extension itself (content script, background CORS proxy, manifests) is still
the installed package; only the panel's UI is remote.

- **Default: on.** Settings → *Hosted UI* → *Remote UI (auto-updating)*.
  Turning it off makes the extension use the sidebar bundled with the install;
  the sidebar reloads immediately. The setting is stored under the
  `remote_ui_enabled` key (absent = on).
- **Custom URL (advanced).** The same card has a *Custom UI URL* field
  (`remote_ui_url`). Only `https://` origins are accepted (plus
  `http://localhost` for development); leave it empty to use the default,
  which is the `DEFAULT_REMOTE_UI_URL` constant in
  `crates/aipage-core/src/remote_ui.rs` (`https://aipage-sooty.vercel.app`).
- **Fallback.** The content script points the sidebar iframe at
  `<hosted>/sidebar.html` and waits for the hosted page to connect over the
  bridge. If that does not happen within 8 seconds (offline, host unreachable,
  the page blocked by a CSP, the WASM failing to boot) or the frame reports an
  error, the iframe is switched to the bundled `sidebar.html`. You never end
  up with an empty panel; a warning is logged in the page console
  (`[AIPage] hosted sidebar unavailable (…)`).
- **How it talks to the extension.** A web page has no `chrome.*` APIs, so the
  hosted sidebar detects that at startup and uses a `postMessage` bridge
  instead (`aipage-bindings::bridge`): it says `hello` to its parent window,
  the content script answers with a private `MessageChannel` port, and the
  five extension calls the sidebar uses (`runtime.sendMessage`,
  `storage.local.get/set`, `storage.onChanged`, `tabs.query/sendMessage`) are
  relayed over that port. The content script answers `tabs.*` for its own tab
  only — it never touches `chrome.tabs`.
- **Security model.** The content script accepts the handshake only when the
  message's `origin` is exactly the configured hosted-UI origin *and* its
  `source` is the sidebar iframe's own window; the reply is posted with that
  origin as `targetOrigin`. After the handshake all traffic runs over a
  transferred `MessagePort`, which scripts of the EduPage page cannot observe.
  The hosted page sends `Content-Security-Policy: frame-ancestors
  https://*.edupage.org`, so only EduPage pages may embed it, plus a strict
  CSP for its own resources. The hosted UI gets exactly the privileges the
  bundled sidebar has and nothing more; no new host permissions were added to
  the manifests. What changes versus the bundled sidebar: you trust the Vercel
  deployment (its content comes from this repository's `main` branch via
  GitHub Actions) and, as with any iframe inside EduPage, a script running in
  the EduPage page could show its own copy of the UI — it still could not read
  your settings or API keys from the extension.

### Deploying the hosted UI

```bash
cargo run -p xtask -- build --target web   # → dist-web/ (hashed js/wasm/css + vercel.json)
```

`.github/workflows/deploy-web.yml` runs that build in the Nix devShell on
every push to `main` that touches the sidebar/core/bindings/assets/xtask (and
on manual dispatch), then deploys the prebuilt directory to production with
`vercel deploy dist-web --prod --yes`. The Vercel team/project ids are plain
`env` values in the workflow; the **repository owner must add one secret**:

| Secret         | Value                                                                 |
| -------------- | --------------------------------------------------------------------- |
| `VERCEL_TOKEN` | A Vercel access token (Account Settings → Tokens) with access to the `dasmatus-personal` team |

`dist-web/vercel.json` (copied from `assets/vercel.json`) sets
`application/wasm`, immutable caching for the content-hashed files,
`no-cache` for `sidebar.html`, and the CSP described above. If the production
domain ever changes, update `DEFAULT_REMOTE_UI_URL` and ship a new extension
build (or set the custom URL in settings in the meantime).

## Development

The extension is a Rust workspace compiled to WebAssembly (`wasm32-unknown-unknown`, `wasm-bindgen`, Leptos). See the [contributing guide](contributing.md) for the toolchain and layout.

```
crates/aipage-bindings/   # bindings to the chrome.* API, hosted-UI bridge transport
crates/aipage-core/       # shared logic: types, storage, i18n, providers, agent loop, imagegen
crates/aipage-sidebar/    # Leptos sidebar UI
crates/aipage-background/ # CORS proxy, web search, toolbar toggle, update check
crates/aipage-content/    # navbar button, sidebar iframe, theming, exam tools, anti-cheat
xtask/                    # build orchestrator
assets/                   # manifests, sidebar.html, JS loaders, anti_cheat.js, stylesheets
scripts/setup-safari.sh   # Safari: Xcode project generator + unsigned app build/zip (macOS)
scripts/sign-firefox.sh   # Firefox: AMO signing (web-ext sign) with same-version fallback
scripts/amo-fetch-signed.mjs  # Firefox: re-download a version AMO already signed
tests/install, tests/e2e  # Playwright test suites
```

### Building

```bash
cargo run -p xtask -- build --target chrome   # or firefox / safari → dist-<target>/
cargo run -p xtask -- build-all               # all three browsers
cargo run -p xtask -- build --target web      # hosted sidebar → dist-web/
```

### Running Tests

```bash
cargo test --workspace        # native unit tests
bun run test:install          # install tests against the built dists (tests/install/README.md)
bun run test:e2e              # Playwright UI tests (tests/e2e/README.md)
```

### Packaging for Distribution

```bash
bun run package:chrome        # aipage-chrome.zip
bun run package:firefox       # packages/*.zip (web-ext; the unsigned Firefox xpi)
bun run sign:firefox          # aipage-firefox.xpi signed by AMO (needs WEB_EXT_API_KEY/SECRET, see below)
bun run package:safari        # aipage-safari.zip (the bare web extension)
bun run package:safari:app    # aipage-safari-macos.zip: AIPage.app built unsigned with Xcode (macOS only)
```

`scripts/setup-safari.sh` on its own only generates `safari/AIPage/AIPage.xcodeproj` (open it in Xcode to sign with your own certificate or to debug); `--build` adds the unsigned Release build, `--package <zip>` also zips `AIPage.app`. It uses `xcrun safari-web-extension-packager` (Xcode 26+) or `safari-web-extension-converter` (older Xcode), with `--macos-only --copy-resources --no-prompt --force`. The packager prints a warning about manifest keys Safari does not support (`downloads`, `notifications` buttons, …); that is expected and does not stop the build.

### CI/CD Pipeline

This project uses [GitHub Actions](https://github.com/dasmatus/aipage/tree/main/.github/workflows) (see `.github/workflows/`) with build/test steps running inside the pinned [Nix flake](https://github.com/dasmatus/aipage/blob/main/flake.nix) devShell:

- **Check job**: `cargo clippy` (with `-D warnings`) + `cargo test --workspace`
- **Build workflow** (`build.yml`, reusable): on Ubuntu, `cargo run -p xtask -- build-all` (Chrome, Firefox, Safari), packages `aipage-chrome.zip`, `aipage-safari.zip` and the Firefox `.xpi`, then runs the **extension install tests** (`bun run test:install`: a real unpacked MV2 install in headless Chromium, `web-ext lint` + a temporary install in headless Firefox that boots the background and sidebar WASM over the remote debugging protocol, a structural check of the Safari dist). A failing install test fails the job. With `sign-firefox: true` the xpi is then signed through AMO (below); otherwise it is uploaded as `aipage-firefox-unsigned.xpi`. A second, **macOS** job downloads the Ubuntu-built `dist-safari`, runs `scripts/setup-safari.sh --package aipage-safari-macos.zip` (Apple's packager + unsigned `xcodebuild`) and uploads the app as its own artifact (`<artifact-name>-safari-macos`); it is marked `continue-on-error`, so a converter/Xcode breakage shows as a red job and a missing asset rather than blocking the other packages. Accepts an optional manifest version stamp.
- **E2e job** (best-effort): Playwright against the built Chrome dist served over HTTP
- **Release workflow**: on a pushed `v*` tag, runs the build workflow (signing on) and publishes a GitHub Release with `aipage-chrome.zip`, `aipage-firefox.xpi` (or `-unsigned`), `aipage-safari.zip` and, when the macOS job succeeded, `aipage-safari-macos.zip`
- **Nightly workflow**: daily cron / manual; skips when `main` is unchanged, otherwise builds with a `<base>.<YYYYMMDD>` version stamp, runs the install tests, signs the Firefox xpi and updates the rolling [`nightly` pre-release](https://github.com/dasmatus/aipage/releases/tag/nightly)

### Firefox signing (AMO)

Release builds of Firefox install only Mozilla-signed extensions, so `build.yml` runs `scripts/sign-firefox.sh` (`web-ext sign --channel unlisted`) for nightlies and releases: it uploads `dist-firefox` to addons.mozilla.org's **self-distribution** channel, waits for the automatic validation + signing (up to 15 minutes), downloads the signed file and ships it as `aipage-firefox.xpi`. The add-on never appears in the public AMO listing; it is identified by the `browser_specific_settings.gecko.id` in `assets/manifest.firefox.json` (`edupage-ai-sidebar@hesburger.dev`), which is also why that manifest declares `data_collection_permissions` — AMO rejects new submissions without it.

The **repository owner must add two secrets** (Settings → Secrets and variables → Actions):

| Secret               | Value                                                                                                                      |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `WEB_EXT_API_KEY`    | The *JWT issuer* of an AMO API key, created at <https://addons.mozilla.org/developers/addon/api/key/> (looks like `user:12345678:123`) |
| `WEB_EXT_API_SECRET` | The *JWT secret* shown together with the issuer (only once, at creation)                                                   |

The account that owns the key becomes the add-on's developer on AMO; the first signed upload creates the (unlisted) add-on there. Without the secrets — forks, pull requests, a fresh clone — the workflow prints a notice and ships the unsigned xpi under the name `aipage-firefox-unsigned.xpi`, so nothing breaks; `ci.yml` never signs because AMO accepts each version string only once and plain CI builds all carry the committed version.

**"Version already exists"**: AMO keeps exactly one immutable file per add-on version. A nightly rebuilt on the same day (same `<base>.<YYYYMMDD>` stamp) or a re-run release workflow would be refused with `Version 1.7.0.20261006 already exists`; `scripts/sign-firefox.sh` recognises that and downloads the file AMO already signed for that version (`scripts/amo-fetch-signed.mjs`, same credentials) instead of failing. To re-sign changed code under the same version you must first delete that version on AMO (Developer Hub → the add-on → *Manage Status & Versions*), or bump the version. If signing fails for any other reason the job fails rather than silently publishing an unsigned file.

Locally the same script works with the two variables exported: `WEB_EXT_API_KEY=… WEB_EXT_API_SECRET=… bun run sign:firefox`.

## Troubleshooting

### "Invalid API Key" Error

- Verify your API key is correct and complete (Claude keys start with `sk-ant-`, OpenAI keys with `sk-`, OpenRouter keys with `sk-or-v1-`)
- Check that the key has not been deactivated or revoked in your provider's console

### Sidebar Not Appearing

- Ensure you're on an EduPage domain (`*.edupage.org`)
- Check that the extension is enabled in `chrome://extensions/`
- Try refreshing the page

### Messages Not Sending

- Verify your API key is saved (click settings icon to check)
- Check your internet connection
- Open browser console (F12) to see any error messages

## Privacy & Security

- Your API key is stored locally using your browser's storage API
- No data is sent to any server except the selected AI provider API
- Conversations are not stored or logged by this extension

## Anti-Cheat Protection

When a test is active (detected via `.etest-player-header`), the extension automatically:

1.  **Prevents Tab Switch Detection**: Overrides the Visibility API (`document.hidden`, `visibilityState`) and blocks `blur`/`focusout` events.
2.  **Blocks Copy-Paste Detection**: Prevents the site from detecting or blocking `copy`, `cut`, `paste`, and `contextmenu` actions.

These features run automatically and require no configuration.

## License

Unless you explicitly state otherwise, any contribution intentionally submitted
for inclusion in the work by you, as defined in the Apache-2.0 license, shall be
dual licensed as above, without any additional terms or conditions.

## Contribution

See [the contribution guide](contributing.md).

## Credits

Built with:

- [Rust](https://www.rust-lang.org/), [wasm-bindgen](https://rustwasm.github.io/wasm-bindgen/) and [Leptos](https://leptos.dev/)
- [resvg](https://github.com/linebender/resvg) for SVG → PNG rasterization
- [Tailwind CSS](https://tailwindcss.com/)
- [Playwright](https://playwright.dev/) for testing
