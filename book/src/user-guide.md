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
    - **Firefox**: `aipage-firefox.xpi`
    - **Safari**: `aipage-safari.zip`

### Chrome

1.  Download `aipage-chrome.zip` from the release.
2.  Unzip the file to a folder on your computer.
3.  Open Chrome and navigate to `chrome://extensions/`.
4.  Enable **"Developer mode"** (toggle in the top-right corner).
5.  Click **"Load unpacked"**.
6.  Select the unzipped folder.

> **Note on Manifest V2**: the extension is a Manifest V2 extension. Current Chrome/Chromium (153 and later) no longer loads MV2 extensions at all, not even unpacked: the `ExtensionManifestV2Disabled`/`ExtensionManifestV2Unsupported` features, `AllowLegacyMV2Extensions` and the `ExtensionManifestV2Availability` enterprise policy no longer exist in those builds. **Brave** (1.96, Chromium 154 base) still loads it: the real-install test passes there, and CI runs that test on both the latest stable Brave and Chromium 141. The Chrome build is only installable on Chromium builds up to the 141 era (started with `--disable-features=ExtensionManifestV2Disabled,ExtensionManifestV2Unsupported`) or on browsers that still allow MV2, such as **[Brave](https://brave.com/)**. An MV3 manifest for Chrome is the pending fix.

### Firefox

1.  Download `aipage-firefox.xpi` from the release.
2.  Open Firefox and navigate to `about:debugging#/runtime/this-firefox`.
3.  Click **"Load Temporary Add-on"**.
4.  Select the downloaded `.xpi` file.

### Safari (macOS only)

1.  Download `aipage-safari.zip` from the release.
2.  Unzip the file to get the application.
3.  Run the application locally.
4.  Open Safari Preferences → Extensions.
5.  Enable the **AIPage** extension.

## Nightly builds

Every night (and on demand) the head of `main` is built for all three browsers and published to a single rolling pre-release:

**<https://github.com/dasmatus/aipage/releases/tag/nightly>**

- The release is re-created in place: the `nightly` tag moves to the built commit, the assets (`aipage-chrome.zip`, `aipage-firefox.xpi`, `aipage-safari.zip`, plus the hosted sidebar bundle `aipage-web.zip` / `aipage-web.json` and its individual files, see [Updates](#updates)) are replaced, and the notes list the commits since the previous nightly. `nightly.json` records the exact commit the assets were built from.
- The manifest version is stamped as `<base>.<YYYYMMDD>` (for example `1.7.0.20261006`), so a nightly sorts above the release it is based on and below the next release. Chrome additionally shows the human-readable `version_name` (`1.7.0-nightly.20261006+<sha>`).
- Nothing is published when `main` has not changed since the last nightly, and a nightly whose extension install tests fail is never published.
- Nightlies are unsigned development builds: they cannot be installed from a store, only unpacked / as a temporary add-on, and they carry whatever is on `main` — including half-finished features.

### Installing a nightly

**Chrome / Chromium / Brave** — unzip `aipage-chrome.zip`, open `chrome://extensions/`, enable **Developer mode** and **Load unpacked** the folder. Chromium 153 and later refuse to load Manifest V2 extensions entirely (the MV2 feature flags and policy are gone from those builds). On a Chromium build up to the 141 era start the browser with

```
--disable-features=ExtensionManifestV2Disabled,ExtensionManifestV2Unsupported
```

(or enable the `AllowLegacyMV2Extensions` feature, exposed as *Allow legacy extension manifest versions* in `chrome://flags` on builds that still have it). This is exactly what the install tests do in CI, pinned to Chrome 141; Brave keeps MV2 support without any flag.

**Firefox** — open `about:debugging#/runtime/this-firefox`, choose **Load Temporary Add-on…** and pick `aipage-firefox.xpi` (or the `manifest.json` of the unzipped file). Temporary add-ons are removed when Firefox exits; a nightly is not signed by AMO, so it cannot be installed permanently on release builds of Firefox.

**Safari (macOS)** — unzip `aipage-safari.zip` and wrap it with Xcode's converter (`xcrun safari-web-extension-converter dist-safari`, see `scripts/setup-safari.sh`), then enable *Allow unsigned extensions* in Safari's Develop menu. Safari cannot run on Linux, so nightlies only receive a structural check for this target.

## Updates

The extension checks **GitHub Releases** for updates — the same place you
install from. There is no store listing, so updating the *extension package*
is always a manual reinstall; the *sidebar UI* can update itself (see below).

### Channels

Settings → *Appearance & App* → **Update channel**:

| Channel | Release followed | Version format |
| ------- | ---------------- | -------------- |
| **Stable** (default) | the latest `vX.Y.Z` release (`releases/latest`) | `1.7.0` |
| **Nightly** | the rolling [`nightly` pre-release](https://github.com/dasmatus/aipage/releases/tag/nightly) | `1.7.0.20261006` (`<base>.<YYYYMMDD>`) |

The setting is stored under the `update_channel` key (absent = `stable`).
Versions are compared component by component, so a nightly sorts above the
release it was built from and below the next release, and a later date is
newer. On the nightly channel two builds can share a version (a forced
rebuild on the same day): the check then compares the commit recorded in
the release's `nightly.json` with the installed one (Chrome exposes it via
`version_name`; Firefox/Safari do not, so there the check remembers the
last commit it notified about) and treats a different commit as an update —
once.

### Extension package

With **Auto-update** on, the background checks the channel's release every
hour through the unauthenticated GitHub API (one request per hour, far below
the 60/hour limit; a rate-limit answer is logged and retried next hour, a
missing release is ignored). When a newer package exists you get a
notification; clicking it (or *Download*) downloads the package for your
browser — `aipage-chrome.zip`, `aipage-firefox.xpi` or `aipage-safari.zip`
(any `aipage-safari*` asset) — which you then install as described above.
**Check for updates now** next to the channel runs the same check on demand,
even with Auto-update off, and shows the result inline.

### Self-updating sidebar UI (GitHub bundle)

Every release also carries the hosted sidebar as `aipage-web.zip`, its hash
manifest `aipage-web.json` (`version`, git `sha`, `built_at`, and the
sha256/size of every file) and the individual files (`sidebar.html`,
`sidebar.<hash>.js`, `sidebar_bg.<hash>.wasm`, `sidebar_loader.<hash>.js`,
`sidebar.<hash>.css`, `tailwind.<hash>.css`). Settings → *Hosted UI* →
**Update the sidebar from GitHub releases (<channel>)** (off by default, key
`ui_bundle_update_enabled`) makes the background download the glue, wasm and
stylesheets of the channel's release — directly from the release assets, no
zip is unpacked — verify each file's sha256 against `aipage-web.json` and
store them in the extension's IndexedDB (database `aipage-ui-bundle`, store
`ui-bundle`: one record per file plus a `meta` record with version, commit,
channel and install time). The hourly check (and *Check for UI updates now*)
replaces the bundle when the release's `version` is higher, or equal with a
different commit, or when the channel changed; a bundle older than the
installed extension's own sidebar is never installed, and an existing one
that became older after an extension update is discarded. **Use bundled UI**
removes the download and switches the mode off; the card shows the installed
bundle's version, channel, commit and date.

When the bundled `sidebar.html` loads, its loader looks the bundle up before
importing the built-in files: the downloaded glue is imported as a `blob:`
module, the wasm is instantiated from the stored bytes and the stylesheets
are attached as `blob:` links. Any problem — missing or corrupt record,
hash mismatch, import or start-up error, timeout — is logged once, the
broken bundle is cleared and the built-in UI boots instead.

**Manifest V2 only.** Importing a downloaded module needs `blob:` in the
extension page's `script-src`, which MV2 allows. Manifest V3 forbids
remotely sourced code altogether, so an MV3 build of AIPage cannot offer
this mode; the Vercel-hosted UI (an iframe to a web origin) remains the
auto-updating option there.

### Which sidebar is used: precedence

1. **Hosted UI (Vercel)** — whenever *Remote UI (auto-updating)* is on; its
   own fallback on failure is the bundled page, which then continues with 2.
2. **GitHub-downloaded bundle** — when *Update the sidebar from GitHub
   releases* is on, a bundle is installed and its version is not older than
   the installed extension.
3. **Bundled files** — the sidebar shipped inside the extension package.

### Security notes

The bundle's files come from GitHub over TLS and are hash-checked against
`aipage-web.json`, which comes from the same release; the manifest's own
integrity rests on the release, so this trusts the repository's release
pipeline (GitHub Actions publishing `vX.Y.Z` tags and the nightly) exactly
the way installing the extension package does — no more. The downloaded UI
runs with the privileges of the bundled sidebar page (same origin, same
CSP), and nothing is executed from a release the background did not verify.

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
crates/aipage-background/ # CORS proxy, web search, toolbar toggle, GitHub update check + sidebar bundle download
crates/aipage-content/    # navbar button, sidebar iframe, theming, exam tools, anti-cheat
xtask/                    # build orchestrator (also writes dist-web/aipage-web.json)
assets/                   # manifests, sidebar.html, JS loaders, anti_cheat.js, stylesheets
scripts/setup-safari.sh   # Safari Xcode project generator (macOS)
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
bun run package:firefox       # packages/*.zip (web-ext; the Firefox xpi)
bun run package:safari        # aipage-safari.zip, wrapped with Xcode via scripts/setup-safari.sh
```

### CI/CD Pipeline

This project uses [GitHub Actions](https://github.com/dasmatus/aipage/tree/main/.github/workflows) (see `.github/workflows/`) with build/test steps running inside the pinned [Nix flake](https://github.com/dasmatus/aipage/blob/main/flake.nix) devShell:

- **Check job**: `cargo clippy` (with `-D warnings`) + `cargo test --workspace`
- **Build workflow** (`build.yml`, reusable): `cargo run -p xtask -- build-all` (Chrome, Firefox, Safari) and `build --target web`, packages `aipage-chrome.zip`, `aipage-safari.zip`, the Firefox `.xpi`, `aipage-web.zip` and `aipage-web.json` (plus the individual web files), then runs the **extension install tests** (`bun run test:install`: a real unpacked MV2 install in headless Chromium — including booting the `dist-web` bundle from IndexedDB through `blob:` imports —, `web-ext lint` + a temporary install in headless Firefox, a structural check of the Safari dist and of `aipage-web.json` against `dist-web`). A failing install test fails the job. Accepts an optional manifest version stamp.
- **E2e job** (best-effort): Playwright against the built Chrome dist served over HTTP
- **Release workflow**: on a pushed `v*` tag, runs the build workflow and publishes a GitHub Release with the packaged assets (browser packages + the sidebar bundle); the extension's update check reads these releases
- **Nightly workflow**: daily cron / manual; skips when `main` is unchanged, otherwise builds with a `<base>.<YYYYMMDD>` version stamp, runs the install tests and updates the rolling [`nightly` pre-release](https://github.com/dasmatus/aipage/releases/tag/nightly) (the *Nightly* update channel)

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
