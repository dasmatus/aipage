# EduPage AI Sidebar Extension

A Chrome extension that adds an AI-powered sidebar to EduPage, featuring a clean interface and integration with Google's Gemini AI.

## Features

- 🤖 AI chat assistant integrated directly into EduPage
- 🎨 Clean, responsive design that matches EduPage's aesthetic
- 💬 Real-time conversations with Gemini AI
- 🔒 Secure local storage of API credentials
- 📱 Responsive sidebar that doesn't obscure important UI elements
- 🛡️ **Anti-Cheat Protection**: Automatically blocks tab switch and copy-paste detection during tests.
- 🧠 **Smart System Prompt**: Ensures the AI acts as a helpful assistant that answers correctly.

## Installation

1. Clone or download this repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Build the extension:
   ```bash
   npm run build
   ```
4. Load the extension in Chrome:
   - Open Chrome and navigate to `chrome://extensions/`
   - Enable "Developer mode" (toggle in top-right corner)
   - Click "Load unpacked"
   - Select the `dist` folder from this project

## Setting Up Your AI Provider

The extension supports multiple AI providers. Choose your preferred provider and configure the corresponding API key.

### Supported Providers

- **Google Gemini** (Default)
- **OpenAI ChatGPT**
- **Anthropic Claude**
- **Mistral AI**
- **LM Studio** (Local)
- **Ollama** (Local)

### Step 1: Choose Your Provider

1. Navigate to any EduPage site (e.g., `https://yourschool.edupage.org`)
2. Click the **AI button** (star icon) in the EduPage navbar
3. The sidebar will open showing the settings view
4. Select your preferred AI provider from the dropdown

### Step 2: Configure Your Provider

#### Google Gemini

1. Visit [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Sign in with your Google account
3. Click **"Get API Key"** or **"Create API Key"**
4. Copy the key (starts with `AIzaSy...`)

#### OpenAI, Claude, Mistral

Follow the links in the sidebar settings to get your API keys from their respective consoles.

#### LM Studio (Local)

1. Open LM Studio and start the **Local Inference Server**.
2. Keep the default Port `1234` or update the **Base URL** in the extension settings.
3. Ensure a model is loaded in LM Studio.
4. Enter the **Model Name** if you want to target a specific one (default: `loaded-model`).

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
│   ├── manifest.json       # Extension manifest
│   ├── background.ts       # Background service worker
│   ├── content.ts          # Content script (injects sidebar)
│   └── sidebar/
│       ├── sidebar.html    # Sidebar UI
│       ├── sidebar.css     # Sidebar styles
│       └── sidebar.ts      # Sidebar logic
├── tests/
│   ├── sidebar.spec.ts     # Sidebar UI tests
│   └── navbar.spec.ts      # Integration tests
├── dist/                   # Built extension (generated)
└── build.js               # Build script
```

### Running Tests

```bash
# Run all tests
npx playwright test

# Run specific test file
npx playwright test tests/sidebar.spec.ts

# View test report
npx playwright show-report
```

### Building

```bash
npm run build
```

This compiles TypeScript files and copies static assets to the `dist` folder.

## Troubleshooting

### "Invalid API Key" Error

- Verify your API key is correct
- Ensure you copied the entire key (starts with `AIzaSy`)
- Check that your API key hasn't been restricted or revoked in Google AI Studio

### Sidebar Not Appearing

- Ensure you're on an EduPage domain (`*.edupage.org`)
- Check that the extension is enabled in `chrome://extensions/`
- Try refreshing the page

### Messages Not Sending

- Verify your API key is saved (click settings icon to check)
- Check your internet connection
- Open browser console (F12) to see any error messages

## Privacy & Security

- Your API key is stored locally using Chrome's storage API
- No data is sent to any server except the selected AI provider API
- Conversations are not stored or logged by this extension

## Anti-Cheat Protection

When a test is active (detected via `.etest-player-header`), the extension automatically:
1.  **Prevents Tab Switch Detection**: Overrides the Visibility API (`document.hidden`, `visibilityState`) and blocks `blur`/`focusout` events.
2.  **Blocks Copy-Paste Detection**: Prevents the site from detecting or blocking `copy`, `cut`, `paste`, and `contextmenu` actions.

These features run automatically and require no configuration.

## License

This project is for educational purposes.

## Credits

Built with:
- [Google Gemini API](https://ai.google.dev/)
- [Playwright](https://playwright.dev/) for testing
- TypeScript & esbuild
