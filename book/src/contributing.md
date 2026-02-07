# Contributing to EduPage AI Sidebar

Thank you for your interest in contributing to the EduPage AI Sidebar! This project aims to bring powerful AI assistance directly into the EduPage experience with a focus on privacy, choice, and professional design.

## 🏗 Architecture Overview

The extension is built with Manifest V3 and supports Chrome, Firefox, and Safari:

- **Browser Polyfill (`src/polyfills/browser-polyfill.ts`)**: Normalizes browser API differences using `webextension-polyfill` for cross-browser compatibility
- **Background Script (`src/background.ts`)**: Acts as a proxy for all AI API requests. This is necessary to bypass CORS restrictions that prevent the sidebar from talking to external APIs directly
- **Content Script (`src/content.ts`)**: Injects the AI Assistant button into the EduPage navbar and manages the sidebar iframe lifecycle
- **Sidebar (`src/sidebar/`)**: The main interface developed with React, TypeScript, and SCSS:
  - `index.tsx`: The orchestrator
  - `providers.ts`: Abstraction layer for different AI services
  - `storage.ts`: Persistence logic
  - `chat-manager.ts`: Handles markdown rendering and message flow
  - `ui-utils.ts`: Shared DOM helpers

## Getting Started

### Prerequisites

- Bun (v1.3.8+) or Node.js (v18+)

### Setup

1. Clone the repository
2. Install dependencies:
   ```bash
   bun install
   ```
3. Build the extension:

   ```bash
   # Build for Chrome
   bun run build:chrome

   # Build for Firefox
   bun run build:firefox

   # Build for Safari (macOS only)
   bun run build:safari

   # Build for all browsers
   bun run build:all
   ```

4. Load into your browser:
   - **Chrome**: Open `chrome://extensions`, enable "Developer mode", click "Load unpacked", select `dist-chrome/`
   - **Firefox**: Open `about:debugging#/runtime/this-firefox`, click "Load Temporary Add-on", select `dist-firefox/manifest.json`
   - **Safari**: Run `./scripts/setup-safari.sh`, then open and build the Xcode project

### Testing

We use Playwright for end-to-end testing:

```bash
# Run all tests (builds Chrome first)
bun test

# Run specific test
npx playwright test tests/sidebar.spec.ts
```

### Cross-Browser Testing

Before submitting changes, ensure compatibility across browsers:

1. Build for all browsers: `bun run build:all`
2. Manually test in each browser (Chrome, Firefox, Safari)
3. Verify core functionality:
   - Sidebar opens/closes correctly
   - AI chat works with your provider
   - Settings save/load correctly
   - Anti-cheat protection activates during tests

## 🛠 Coding Standards

- **TypeScript**: Use strict-ish types. Avoid `any` where possible.
- **JSDoc**: Document all exported functions and classes.
- **CSS**: Use the variables defined in `sidebar.css` (:root) to ensure consistency with the theme.
- **Privacy**: Never store API keys outside of `chrome.storage.local`.

## 🎨 Adding New Providers

To add a new AI provider:

1. Implement a class in `src/sidebar/providers.ts` that extends the `AIProvider` interface
2. Register it in the `providers` object at the bottom of the file
3. Add any necessary host permissions to all manifest files:
   - `src/manifest.json` (Chrome)
   - `src/manifest.firefox.json` (Firefox)
   - `src/manifest.safari.json` (Safari)
4. Update `src/sidebar/sidebar.html` with relevant instructions

## Conventional Commits

This project uses [Conventional Commits](https://www.conventionalcommits.org/) for automatic changelog generation.

### Commit Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types

- **feat**: A new feature
- **fix**: A bug fix
- **docs**: Documentation changes
- **style**: Code style changes (formatting, etc.)
- **refactor**: Code refactoring
- **perf**: Performance improvements
- **test**: Adding or updating tests
- **build**: Build system changes
- **ci**: CI/CD changes
- **chore**: Other changes that don't modify src or test files

### Examples

```bash
git commit -m "feat(sidebar): add dark mode toggle"
git commit -m "fix(firefox): resolve storage sync issue"
git commit -m "docs: update installation instructions"
git commit -m "ci: add pages deployment stage"
```

### Creating a Release

To create a new release with automatic changelog:

```bash
# Patch release (1.1.0 → 1.1.1)
npm run release

# Minor release (1.1.0 → 1.2.0)
npm run release:minor

# Major release (1.1.0 → 2.0.0)
npm run release:major
```

This will:

1. Bump version in package.json
2. Update CHANGELOG.md based on commits
3. Create a git tag
4. Push changes and tags to Git

## CI/CD Pipeline

This project uses GitLab CI for automated builds and testing:

- **Lint**: ESLint validation on all TypeScript files
- **Build**: Parallel builds for Chrome, Firefox, and Safari
- **Test**: Playwright tests on Chrome build
- **Package**: Creates distribution packages for all browsers

The pipeline runs on all merge requests and commits to `main`/`develop` branches.

Happy coding!
