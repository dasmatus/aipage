# Contributing to EduPage AI Sidebar

Thank you for your interest in contributing to the EduPage AI Sidebar! This project aims to bring powerful AI assistance directly into the EduPage experience with a focus on privacy, choice, and professional design.

## 🏗 Architecture Overview

The extension is built with a standard Chrome Manifest V3 architecture:

- **Background Script (`src/background.ts`)**: Acts as a proxy for all AI API requests. This is necessary to bypass CORS restrictions that prevent the sidebar from talking to external APIs directly.
- **Content Script (`src/content.ts`)**: Injects the AI Assistant button into the EduPage navbar and manages the sidebar iframe lifecycle.
- **Sidebar (`src/sidebar/`)**: The main interface developed with HTML, CSS, and TypeScript.
  - `sidebar.ts`: The orchestrator.
  - `providers.ts`: Abstraction layer for different AI services.
  - `storage.ts`: Persistence logic.
  - `chat-manager.ts`: Handles markdown rendering and message flow.
  - `ui-utils.ts`: Shared DOM helpers.

## 🚀 Getting Started

### Prerequisites
- Node.js (v18+)
- npm

### Setup
1. Clone the repository.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Build the extension:
   ```bash
   npm run build
   ```
4. Load into Chrome:
   - Open `chrome://extensions`
   - Enable "Developer mode"
   - Click "Load unpacked" and select the `extension/src` folder (ensure `dist` is populated).

### Testing
We use Playwright for end-to-end testing:
```bash
npx playwright test
```

## 🛠 Coding Standards

- **TypeScript**: Use strict-ish types. Avoid `any` where possible.
- **JSDoc**: Document all exported functions and classes.
- **CSS**: Use the variables defined in `sidebar.css` (:root) to ensure consistency with the theme.
- **Privacy**: Never store API keys outside of `chrome.storage.local`.

## 🎨 Adding New Providers

To add a new AI provider:
1. Implementation a class in `src/sidebar/providers.ts` that extends the `AIProvider` interface.
2. Register it in the `providers` object at the bottom of the file.
3. Add any necessary host permissions to `manifest.json`.
4. Update `sidebar.html` with relevant instructions.

Happy coding!
