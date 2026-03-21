# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

A cross-browser extension (Chrome, Firefox, Safari) that injects an AI-powered sidebar into [EduPage](https://edupage.org), an educational platform. The sidebar lets students chat with AI, scan page content for context, and run web searches — all without leaving EduPage.

## Branching

Always create a new branch before making any code changes. Use a descriptive name based on the task:

```bash
git checkout -b feat/short-description
# or
git checkout -b fix/short-description
```

Never commit directly to `main`.

## Commands

```bash
# Build (default: Chrome)
bun run build
bun run build:chrome
bun run build:firefox
bun run build:safari
bun run build:all

# Package for distribution
bun run package:chrome    # Creates .zip
bun run package:firefox   # Creates .xpi via web-ext

# Lint and test
bun run lint
bun run test
bun run test:watch
bun run test:coverage

# Run a single test file
bunx jest src/sidebar/components/Chat/__tests__/MessageList.test.tsx

# Release
bun run release           # patch
bun run release:minor
bun run release:major
```

After building, load `dist-chrome/` (or relevant dist dir) as an unpacked extension in the browser.

## Architecture

### Extension Scripts (3 independent contexts)

1. **`src/background.ts`** — Service worker. Acts as a CORS proxy: all API calls from the sidebar go through `browser.runtime.sendMessage({ action: 'proxy_fetch', ... })` which this script executes with higher privileges. Also handles `search_web` (DuckDuckGo instant answers) and toolbar icon click to toggle sidebar.

2. **`src/content.ts`** — Injected into EduPage pages. Creates the AI button in EduPage's navbar (`.edubarQuickmenu`) or exam player (`.etest-player-header-inner`), manages the sidebar iframe via `SidebarController`, and responds to `get_page_content` messages from the sidebar. Injects anti-cheat bypass when an exam is detected.

3. **`src/sidebar/index.tsx`** — React app running inside an `<iframe>` (`sidebar.html`). This is the UI. It is isolated from the host page and communicates with the content script and background via `browser.runtime.sendMessage`.

### Sidebar React App (`src/sidebar/`)

- **`App.tsx`** — Top-level component. Manages `view` state (`'chat'` | `'settings'`), initializes from storage, and wires together `useChat`, `InputArea`, `MessageList`, and `SettingsView`.
- **`hooks/useChat.ts`** — All chat state and logic: message list, `isTyping`, `sendMessage`, `handlePageContext`, `generatePromptFromAction`. The initial greeting is hardcoded in Slovak here.
- **`providers/`** — Provider pattern. `getProvider(type)` returns an `AIProvider` instance. Each provider (`VercelSDKProvider`, `LMStudioProvider`, `OllamaProvider`) has `sendMessage()` and `getModels()`. All HTTP calls go through `performRequest()` in `providers/utils.ts`, which routes to the background CORS proxy.
- **`storage.ts`** — All `browser.storage.local` access. Storage keys are defined in `STORAGE_KEYS`. Never access storage directly from components — always go through this module.
- **`i18n.ts`** + **`locales/`** — Translation via `t(key, language)`. Five languages: `sk` (default), `en`, `cs`, `de`, `hu`.
- **`sidebar.scss`** — Theme system using CSS custom properties. Six themes: `default`, `sms`, `gradient`, `discord`, `tokyo`, `mono`. Theme is applied via `document.body.dataset.theme`.

### Content Scripts (`src/content-scripts/`)

- **`sidebar-controller.ts`** — `SidebarController` class: creates/manages the iframe and resizer div, handles drag-to-resize (250–450px), adjusts page layout (`document.body.width`, navbar, `.etest-player`) when sidebar opens/closes.
- **`theme-manager.ts`** — Applies sidebar theme CSS variables to the host page when "global theme" is enabled.
- **`anti-cheat-injector.ts`** — Injects `anti_cheat.js` into the page context (not the extension context) to suppress tab-switch detection events during exams.

### Build System

`build.ts` uses Bun's native bundler. It produces 4 JS bundles + Sass → CSS + PostCSS/Tailwind → CSS, then copies `sidebar.html` and the correct manifest. Each browser target writes to `dist-{target}/`.

### Key Architectural Constraints

- **No streaming**: Despite using the Vercel AI SDK as a dependency, `VercelSDKProvider` does not stream; it sends a single request and calls `onProgress` once with the full response.
- **CORS proxy is mandatory**: The sidebar iframe cannot make direct fetch calls to external APIs due to CORS. All API calls must go through `performRequest()` → background script.
- **Manifest V2**: All three manifests use MV2. This limits Chrome (requires Brave or developer mode) but is required for Firefox and Safari compatibility.
- **User initials via URL hash**: The content script passes user initials to the sidebar via `iframe.src = sidebar.html#initials=XY` since the iframe is cross-origin from the extension's perspective.
