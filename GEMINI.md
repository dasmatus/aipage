# ♊ Gemini CLI & AI Developer Guide

This guide describes how to use Gemini (and other agentic AI) via the CLI to maintain and extend the AIPage.

## 🌿 Branching

Always create a new branch before making any code changes. Use a descriptive name based on the task:

```bash
git checkout -b feat/short-description
# or
git checkout -b fix/short-description
```

Never commit directly to `main`.

## 🚀 CLI Commands

The following commands are the "source of truth" for the AI when interacting with the project:

| Command                 | Purpose                                        | When to run                         |
| ----------------------- | ---------------------------------------------- | ----------------------------------- |
| `bun run build:chrome`  | Builds extension for Chrome                    | When targeting Chrome               |
| `bun run build:firefox` | Builds extension for Firefox (with validation) | When targeting Firefox              |
| `bun run build:safari`  | Builds extension for Safari                    | When targeting Safari               |
| `bun run build:all`     | Builds for all browsers                        | Before committing/for CI            |
| `bun test`              | Runs the full E2E test suite                   | Before committing/notifying user    |
| `bun install <pkg>`     | Adds new dependencies                          | When adding libraries like `marked` |

## 🏗 Core Architecture for AI

When instructing Gemini to make changes, refer to these architectural "anchors":

- **Cross-Browser Support**: Extension works on Chrome, Firefox, and Safari using `webextension-polyfill` for API normalization
- **Browser Polyfill**: All browser API calls go through `src/polyfills/browser-polyfill.ts` for compatibility
- **CORS Proxy**: All API requests _must_ go through the Background Service Worker (`src/background.ts`) using the `proxy_fetch` action
- **Provider Abstraction**: All AI services must implement the `AIProvider` interface in `src/sidebar/providers.ts`
- **Multi-Browser Builds**: Each browser has its own manifest (`manifest.json`, `manifest.firefox.json`, `manifest.safari.json`) and build output directory (`dist-chrome`, `dist-firefox`, `dist-safari`)
- **Modular Sidebar**:
  - `storage.ts`: Persistence for keys and settings
  - `ui-utils.ts`: DOM manipulation and view logic
  - `chat-manager.ts`: Response orchestration and markdown rendering

## 📝 Common AI Prompts (CLI)

You can copy and paste these prompts into your Gemini interface to perform common tasks:

### Add a new AI Provider

> "Gemini, I want to add [New AI Name] support. Update `providers.ts` with a new class, add instructions to `sidebar.html`, and ensure the background script has the correct host permissions in `manifest.json`."

### Modify Sidebar Styles

> "Gemini, update the sidebar theme to use [Color Scheme]. Make sure to update the `:root` variables in `sidebar.css` and verify that the header and buttons match."

### Fix Test Failures

> "Gemini, the Playwright tests are failing in `tests/sidebar.spec.ts`. Analyze the error, fix the selector or logic, and run the tests again until they pass green."

## 🛠 Contribution Policy

1. **Build First**: Always run `bun run build` to ensure types are correct.
2. **Test Always**: Never submit a PR or final change without a passing `bun test` run.
3. **Docs**: If you change the architecture, update `CONTRIBUTING.md` and this `GEMINI.md` file.

---

_Created for both humans and "clankers" to build better tools together._
