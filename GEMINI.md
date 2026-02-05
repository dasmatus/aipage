# ♊ Gemini CLI & AI Developer Guide

This guide describes how to use Gemini (and other agentic AI) via the CLI to maintain and extend the EduPage AI Sidebar.

## 🚀 CLI Commands

The following commands are the "source of truth" for the AI when interacting with the project:

| Command | Purpose | When to run |
|---------|---------|-------------|
| `npm run build` | Compiles TypeScript and bundles via esbuild | After any code change |
| `npx playwright test` | Runs the full E2E test suite | Before committing/notifying user |
| `npm install <pkg>` | Adds new dependencies | When adding libraries like `marked` |

## 🏗 Core Architecture for AI

When instructing Gemini to make changes, refer to these architectural "anchors":

- **CORS Proxy**: All API requests *must* go through the Background Service Worker (`src/background.ts`) using the `proxy_fetch` action.
- **Provider Abstraction**: All AI services must implement the `AIProvider` interface in `src/sidebar/providers.ts`.
- **Modular Sidebar**:
  - `storage.ts`: Persistence for keys and settings.
  - `ui-utils.ts`: DOM manipulation and view logic.
  - `chat-manager.ts`: Response orchestration and markdown rendering.

## 📝 Common AI Prompts (CLI)

You can copy and paste these prompts into your Gemini interface to perform common tasks:

### Add a new AI Provider
> "Gemini, I want to add [New AI Name] support. Update `providers.ts` with a new class, add instructions to `sidebar.html`, and ensure the background script has the correct host permissions in `manifest.json`."

### Modify Sidebar Styles
> "Gemini, update the sidebar theme to use [Color Scheme]. Make sure to update the `:root` variables in `sidebar.css` and verify that the header and buttons match."

### Fix Test Failures
> "Gemini, the Playwright tests are failing in `tests/sidebar.spec.ts`. Analyze the error, fix the selector or logic, and run the tests again until they pass green."

## 🛠 Contribution Policy

1. **Build First**: Always run `npm run build` to ensure types are correct.
2. **Test Always**: Never submit a PR or final change without a passing `npx playwright test` run.
3. **Docs**: If you change the architecture, update `CONTRIBUTING.md` and this `GEMINI.md` file.

---
*Created for both humans and "clankers" to build better tools together.*
