# EduPage AI Sidebar Extension

A Chrome extension that adds an AI-powered sidebar to EduPage, featuring a clean interface and integration with Google's Gemini AI.

## Features

- 🤖 AI chat assistant integrated directly into EduPage
- 🎨 Clean, responsive design that matches EduPage's aesthetic
- 💬 Real-time conversations with Gemini AI
- 🔒 Secure local storage of API credentials
- 📱 Responsive sidebar that doesn't obscure important UI elements

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

## Setting Up Your Gemini API Key

To use the AI assistant, you'll need a Google Gemini API key:

### Step 1: Get Your API Key

1. Visit [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Sign in with your Google account
3. Click **"Get API Key"** or **"Create API Key"**
4. Choose to create a new API key in a new or existing project
5. Copy the generated API key (it will look like: `AIzaSy...`)

⚠️ **Important**: Keep your API key secure and never share it publicly!

### Step 2: Configure the Extension

1. Navigate to any EduPage site (e.g., `https://yourschool.edupage.org`)
2. Click the **AI button** (star icon) in the EduPage navbar
3. The sidebar will open showing the settings view
4. Paste your API key into the **"API Key"** field
5. Click **"Save Key"**

Your API key is stored locally in your browser and is never sent anywhere except to Google's Gemini API when you send messages.

### Step 3: Start Chatting

Once your API key is saved:
- The sidebar will automatically switch to the chat view
- Type your question in the input field at the bottom
- Press Enter or click the send button
- The AI will respond to your queries

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
- No data is sent to any server except Google's Gemini API
- Conversations are not stored or logged by this extension

## License

This project is for educational purposes.

## Credits

Built with:
- [Google Gemini API](https://ai.google.dev/)
- [Playwright](https://playwright.dev/) for testing
- TypeScript & esbuild
