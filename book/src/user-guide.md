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

To install the extension, download the latest build artifacts directly from our GitLab CI pipelines.

1.  Visit the [GitLab Pipelines](https://gitlab.com/TenTypekMatus/aipage/-/pipelines) page.
2.  Locate the latest successful pipeline for the `main` branch (status: Passed).
3.  Click the **Download artifacts** icon (or access the pipeline details).
4.  Download the artifact for your specific browser job:
    - **Chrome**: Look for the `package:chrome` job artifact (contains `aipage-chrome.zip`).
    - **Firefox**: Look for the `package:firefox` job artifact (contains `.xpi` file).
    - **Safari**: Look for the `package:safari` job artifact (contains `aipage-safari.zip`).

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

## Setting Up Your AI Provider

The extension supports multiple AI providers. Choose your preferred provider and configure the corresponding API key.

### Supported Providers

- **Claude (Anthropic)** — chat, native web search, and SVG image generation
- **LM Studio** (Local)
- **Ollama** (Local)

### Step 1: Choose Your Provider

1. Navigate to any EduPage site (e.g., `https://yourschool.edupage.org`)
2. Click the **AI button** (star icon with the AI text) in the EduPage navbar
3. The sidebar will open showing the settings view
4. Select your preferred AI provider from the dropdown

### Step 2: Configure Your Provider

#### Claude (Anthropic)

The cloud provider talks directly to Claude through the official Anthropic API.

1. Go to **[the Anthropic Console](https://console.anthropic.com)** and sign in (or create an account).
2. Open **Settings → API Keys** (direct link: `https://console.anthropic.com/settings/keys`).
3. Click **Create Key**, give it a name, and copy it — the key starts with `sk-ant-`.
4. Paste the key into the AIPage settings and pick a Claude model (e.g. `claude-opus-4-8`).

> The key is stored locally in your browser and is only ever sent to `api.anthropic.com` (through the extension's background proxy). Claude also powers **web search** — its built-in search tool, so no extra key is needed — and **image generation**: Claude draws an SVG that the extension renders to a PNG in-browser with WebAssembly ImageMagick.

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

This project uses GitLab CI for automated building and testing:

- **Lint Stage**: Runs ESLint on all TypeScript files
- **Build Stage**: Builds extensions for Chrome, Firefox, and Safari in parallel
- **Test Stage**: Runs Playwright tests on Chrome build
- **Package Stage**: Creates distribution packages for all browsers

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

See [the contribution guide](https://gitlab.com/TenTypekMatus/aipage/-/blob/main/book/src/contributing.md?ref_type=heads).

## Credits

Built with:

- [Anthropic API](https://www.anthropic.com/api)
- [@imagemagick/magick-wasm](https://github.com/dlemstra/magick-wasm) for SVG → image conversion
- [shadcn/ui](https://ui.shadcn.com)
- [Playwright](https://playwright.dev/) for testing
- TypeScript & esbuild
