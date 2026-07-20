# Contributing to AIPage

Thank you for your interest in contributing to AIPage! We welcome contributions from the community to help make this extension better for everyone.

This guide will help you get started with setting up the project, understanding the codebase, and submitting your changes.

## 🚀 Getting Started

### Prerequisites

- **[Bun](https://bun.sh/)** (v1.0.0 or later) - We use Bun for package management, testing, and building.
- **Node.js** (v18+) - Required for some tooling compatibility.

### Installation

1.  **Clone the repository:**

    ```bash
    git clone https://codeberg.org/dasmatus/aipage.git
    cd aipage/extension
    ```

2.  **Install dependencies:**

    ```bash
    bun install
    ```

## 🛠 Development Workflow

### Building the Extension

We support Chrome, Firefox, and Safari. Each browser has its own build command:

- **Chrome:** `bun run build:chrome` (Output: `dist-chrome/`)
- **Firefox:** `bun run build:firefox` (Output: `dist-firefox/`)
- **Safari:** `bun run build:safari` (Output: `dist-safari/`)
- **All Browsers:** `bun run build:all`

### Running Tests

We use **Playwright** for End-to-End (E2E) testing.

- **Run all tests:**

  ```bash
  bun test
  ```

  _Note: This automatically runs the build first._

- **Run a specific test file:**
  ```bash
  bunx playwright test tests/sidebar.spec.ts
  ```

### Documentation

We use **MDBook** for documentation.

- **Build documentation:**
  ```bash
  bun run docs:build
  ```
- **Serve documentation locally:**
  ```bash
  bun run docs:serve
  ```

## 🏗 Project Structure

- **`src/`**: Source code for the extension.
  - **`sidebar/`**: The main React application for the sidebar UI.
    - **`components/`**: React components (Chat, Settings, etc.).
    - **`providers/`**: AI provider implementations (Anthropic/Claude, LM Studio, Ollama).
    - **`i18n.ts`**: Localization configurations.
  - **`background.ts`**: Service worker for handling API requests (CORS proxy) and events.
  - **`content.ts`**: Content script injected into EduPage pages.
  - **`polyfills/`**: Browser API compatibility layer.
- **`tests/`**: Playwright E2E test suites.
- **`dist-*/`**: Build artifacts for each browser.
- **`public/`**: Static assets for documentation.

## 📝 Coding Guidelines

- **TypeScript:** Use strong typing whenever possible. Avoid `any`.
- **Styling:** We use SCSS modules or standard CSS. Keep styles modular.
- **Linting:** Run `bun run lint` to check for code style issues before committing.
- **Testing:** Ensure all new features are covered by tests. Verify existing tests pass.

## 🤝 Submitting Changes

1.  **Fork the repository** and create your branch from `main`.
2.  **Make your changes** and commit them with clear, descriptive messages.
3.  **Run tests** (`bun test`) to ensure nothing is broken.
4.  **Submit a Pull Request (PR)** to the `main` branch.
5.  **Describe your changes** in the PR description, linking to any relevant issues.

## 🐛 Reporting Issues

If you find a bug or have a feature request, please open an issue on our [Codeberg Issue Tracker](https://codeberg.org/dasmatus/aipage/issues). Provide as much detail as possible, including steps to reproduce the issue.

Thank you for contributing!
