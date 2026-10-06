# AIPage Extension

A cross-browser extension for Chrome, Firefox, and Safari that adds an AI-powered sidebar to EduPage, featuring a clean interface and integration with multiple AI providers.

## Features

- AI chat assistant integrated directly into EduPage
- **Multi-Browser Support**: Works on Chrome, Firefox, and Safari
- Clean, responsive design that matches EduPage's aesthetic
- Real-time conversations with Claude via the official Anthropic API, plus local LM Studio and Ollama
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

1.  Download `aipage-chrome.zip` (from the `package:chrome` job artifact).
2.  Unzip the file to a folder on your computer.
3.  Open Chrome and navigate to `chrome://extensions/`.
4.  Enable **"Developer mode"** (toggle in the top-right corner).
5.  Click **"Load unpacked"**.
6.  Select the unzipped folder.

> **Note on Manifest V2**: Chrome has phased out Manifest V2 extensions. If you encounter issues loading the extension, please refer to this guide on [how to enable Manifest V2 in Chrome](https://gist.github.com/velzie/053ffedeaecea1a801a2769ab86ab376).
>
> If you are unable to enable Manifest V2 in Chrome, we recommend using **[Brave Browser](https://brave.com/)**, which retains support for Manifest V2 extensions.

### Firefox

1.  Download the `.xpi` file from the `package:firefox` job artifact.
2.  Open Firefox and navigate to `about:debugging#/runtime/this-firefox`.
3.  Click **"Load Temporary Add-on"**.
4.  Select the downloaded `.xpi` file.

### Safari (macOS only)

1.  Download `aipage-safari.zip` from the `package:safari` job artifact.
2.  Unzip the file to get the application.
3.  Run the application locally.
4.  Open Safari Preferences → Extensions.
5.  Enable the **AIPage** extension.

## Nightly builds

Every night (and on demand) the head of `main` is built for all three browsers and published to a single rolling pre-release:

**<https://github.com/dasmatus/aipage/releases/tag/nightly>**

- The release is re-created in place: the `nightly` tag moves to the built commit, the assets (`aipage-chrome.zip`, `aipage-firefox.xpi`, `aipage-safari.zip`) are replaced, and the notes list the commits since the previous nightly. `nightly.json` records the exact commit the assets were built from.
- The manifest version is stamped as `<base>.<YYYYMMDD>` (for example `1.7.0.20261006`), so a nightly sorts above the release it is based on and below the next release. Chrome additionally shows the human-readable `version_name` (`1.7.0-nightly.20261006+<sha>`).
- Nothing is published when `main` has not changed since the last nightly, and a nightly whose extension install tests fail is never published.
- Nightlies are unsigned development builds: they cannot be installed from a store, only unpacked / as a temporary add-on, and they carry whatever is on `main` — including half-finished features.

### Installing a nightly

**Chrome / Chromium / Brave** — unzip `aipage-chrome.zip`, open `chrome://extensions/`, enable **Developer mode** and **Load unpacked** the folder. Current Chromium builds refuse to load Manifest V2 extensions, even unpacked ones; start the browser with

```
--disable-features=ExtensionManifestV2Disabled,ExtensionManifestV2Unsupported
```

(or enable the `AllowLegacyMV2Extensions` feature, exposed as *Allow legacy extension manifest versions* in `chrome://flags` on builds that still have it). This is exactly what the install tests do in CI; Brave keeps MV2 support without any flag.

**Firefox** — open `about:debugging#/runtime/this-firefox`, choose **Load Temporary Add-on…** and pick `aipage-firefox.xpi` (or the `manifest.json` of the unzipped file). Temporary add-ons are removed when Firefox exits; a nightly is not signed by AMO, so it cannot be installed permanently on release builds of Firefox.

**Safari (macOS)** — unzip `aipage-safari.zip` and wrap it with Xcode's converter (`xcrun safari-web-extension-converter dist-safari`, see `scripts/setup-safari.sh`), then enable *Allow unsigned extensions* in Safari's Develop menu. Safari cannot run on Linux, so nightlies only receive a structural check for this target.

## Setting Up Your AI Provider

The extension supports multiple AI providers. Choose your preferred provider and configure the corresponding API key.

### Supported Providers

- **Ollama Cloud** — chat, agentic tools, native web search, and SVG image generation
- **OpenRouter** — the same feature set over any OpenRouter model (`vendor/model` ids)
- **ChatGPT / OpenAI** — the same feature set over the public OpenAI API (`gpt-*` models, API key)
- **ChatGPT / OpenAI** — the same feature set over the public OpenAI API (`gpt-*` models, API key)
- **Claude (Anthropic)** — chat, native web search, and SVG image generation
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

## Development

### Project Structure

```
extension/
├── src/
│   ├── manifest.json           # Chrome manifest
│   ├── manifest.firefox.json   # Firefox manifest
│   ├── manifest.safari.json    # Safari manifest
│   ├── background.ts            # Background service worker
│   ├── content.ts               # Content script (injects sidebar)
│   ├── polyfills/
│   │   └── browser-polyfill.ts  # Cross-browser compatibility
│   └── sidebar/
│       ├── sidebar.html         # Sidebar UI
│       ├── sidebar.scss         # Sidebar styles
│       └── index.tsx            # Sidebar logic (React)
├── scripts/
│   └── setup-safari.sh          # Safari Xcode project generator
├── tests/
│   ├── sidebar.spec.ts          # Sidebar UI tests
│   ├── navbar.spec.ts           # Integration tests
│   ├── test-player.spec.ts      # Anti-cheat tests
│   └── context.spec.ts          # Context menu tests
├── dist-chrome/                 # Chrome build output
├── dist-firefox/                # Firefox build output
├── dist-safari/                 # Safari build output
└── build.ts                     # Multi-browser build script
```

### Building

```bash
# Build for a specific browser
bun run build:chrome
bun run build:firefox
bun run build:safari

# Build for all browsers
bun run build:all
```

### Running Tests

```bash
# Run all tests (builds Chrome first)
bun test

# Run specific test file
bunx playwright test tests/sidebar.spec.ts

# View test report
bunx playwright show-report
```

### Packaging for Distribution

```bash
# Package Chrome extension (.zip)
bun run package:chrome

# Package Firefox extension (.xpi)
bun run package:firefox

# Outputs:
# - edupage-ai-sidebar-chrome.zip (for Chrome Web Store)
# - packages/*.xpi (for Firefox Add-ons)
# - Safari requires App Store submission via Xcode
```

### CI/CD Pipeline

This project uses [GitHub Actions](https://github.com/dasmatus/aipage/tree/main/.github/workflows) (see `.github/workflows/`) with build/test steps running inside the pinned [Nix flake](https://github.com/dasmatus/aipage/blob/main/flake.nix) devShell:

- **Check job**: `cargo clippy` (with `-D warnings`) + `cargo test --workspace`
- **Build workflow** (`build.yml`, reusable): `cargo run -p xtask -- build-all` (Chrome, Firefox, Safari), packages `aipage-chrome.zip`, `aipage-safari.zip` and the Firefox `.xpi`, then runs the **extension install tests** (`bun run test:install`: a real unpacked MV2 install in headless Chromium, `web-ext lint` + a temporary install in headless Firefox, a structural check of the Safari dist). A failing install test fails the job. Accepts an optional manifest version stamp.
- **E2e job** (best-effort): Playwright against the built Chrome dist served over HTTP
- **Release workflow**: on a pushed `v*` tag, runs the build workflow and publishes a GitHub Release with the packaged assets
- **Nightly workflow**: daily cron / manual; skips when `main` is unchanged, otherwise builds with a `<base>.<YYYYMMDD>` version stamp, runs the install tests and updates the rolling [`nightly` pre-release](https://github.com/dasmatus/aipage/releases/tag/nightly)

## Troubleshooting

### "Invalid API Key" Error

- Verify your API key is correct
- Ensure you copied the entire key (it starts with `sk-ant-`)
- Check that your API key hasn't been deactivated or revoked in the [Anthropic Console](https://console.anthropic.com/settings/keys)

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

See [the contribution guide](https://codeberg.org/dasmatus/aipage/src/branch/main/book/src/contributing.md).

## Credits

Built with:

- [Anthropic API](https://www.anthropic.com/api)
- [@imagemagick/magick-wasm](https://github.com/dlemstra/magick-wasm) for SVG → image conversion
- [shadcn/ui](https://ui.shadcn.com)
- [Playwright](https://playwright.dev/) for testing
- TypeScript & esbuild
