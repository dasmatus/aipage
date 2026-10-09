# Introduction

Welcome to the **AIPage** documentation!

AIPage is a cross-browser extension (Chrome, Firefox, Safari) that adds an AI sidebar to EduPage. It is written in Rust and compiled to WebAssembly.

## Features

- **Multi-Browser Support**: Works on Chrome, Firefox, and Safari
- **Several AI backends**: Ollama Cloud, OpenRouter, ChatGPT / OpenAI and Claude (Anthropic) for chat, agentic page tools, native web search and SVG image generation; LM Studio and Ollama for local models
- **Anti-Cheat Protection**: Automatically blocks tab switch and copy-paste detection during tests
- **Privacy First**: All API keys stored locally, no data collection
- **Hosted UI**: The sidebar UI auto-updates from a web origin, with the bundled copy as fallback

## Quick Links

- **[Installation](installation.md)**: Install a release or a nightly
- **[AI Providers](providers.md)**: Set up an AI backend and start chatting
- **[User Guide](user-guide.md)**: Everything else about using the extension
- **[Contributing Guide](contributing.md)**: Developer documentation
- **[Packaging, CI & Deployment](packaging.md)**: Release packages, workflows and hosting
- **[Changelog](changelog.md)**: Version history

## Credits

Built with:

- [Rust](https://www.rust-lang.org/), [wasm-bindgen](https://rustwasm.github.io/wasm-bindgen/) and [Leptos](https://leptos.dev/)
- [resvg](https://github.com/linebender/resvg) for SVG → PNG rasterization
- [Tailwind CSS](https://tailwindcss.com/)
- [Playwright](https://playwright.dev/) for testing
