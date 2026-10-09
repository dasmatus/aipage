# AIPage Extension

A cross-browser extension for Chrome, Firefox, and Safari that adds an AI-powered sidebar to EduPage, featuring a clean interface and integration with multiple AI providers. It is written in Rust and compiled to WebAssembly.

**Documentation: <https://aipage-docs.vercel.app>** (built from [`book/src/`](book/src) with mdBook).

## Features

- AI chat assistant integrated directly into EduPage
- Clean, responsive design that matches EduPage's aesthetic and doesn't obscure important UI elements
- **Multi-Browser Support**: Works on Chrome, Firefox, and Safari
- Chat with Ollama Cloud, OpenRouter, ChatGPT / OpenAI, Claude (Anthropic) or Claude Code, or with a local LM Studio / Ollama
- Agentic page tools, web search and SVG image generation
- Secure local storage of API credentials
- **Anti-Cheat Protection**: Automatically blocks tab switch and copy-paste detection during tests
- **Smart System Prompt**: Ensures the AI acts as a helpful assistant that answers correctly
- **Self-updating UI**: the sidebar loads from a hosted copy, with the bundled one as fallback

## Quick start

1. Download the package for your browser from the [latest release](https://github.com/dasmatus/aipage/releases/latest) (or the rolling [nightly](https://github.com/dasmatus/aipage/releases/tag/nightly)) and install it as described in [Installation](book/src/installation.md).
2. Open any `*.edupage.org` page, click the **AI** button in the navbar and pick a provider in the settings ([AI Providers](book/src/providers.md)).

## Documentation

| Page | Contents |
| ---- | -------- |
| [Installation](book/src/installation.md) | Chrome / Brave, Firefox and Safari; nightly builds |
| [AI Providers](book/src/providers.md) | Setting up each AI backend, using the sidebar |
| [Updates](book/src/updates.md) | Update channels, update check, self-updating sidebar bundle |
| [Hosted UI](book/src/hosted-ui.md) | The Vercel-hosted sidebar, fallback and security model |
| [Anti-Cheat Protection](book/src/anti-cheat.md) | What runs while a test is active |
| [Privacy & Security](book/src/privacy.md) | Where your keys and conversations go |
| [Troubleshooting](book/src/troubleshooting.md) | Common problems |
| [Contributing](book/src/contributing.md) | Toolchain, layout, building, testing, releasing |
| [Packaging, CI & Deployment](book/src/packaging.md) | Packages, GitHub Actions workflows, AMO signing, Vercel |
| [Changelog](book/src/changelog.md) | Version history |

## License

Licensed under either of [Apache License, Version 2.0](LICENSE-APACHE) or [MIT license](LICENSE-MIT) at your option.

Unless you explicitly state otherwise, any contribution intentionally submitted
for inclusion in the work by you, as defined in the Apache-2.0 license, shall be
dual licensed as above, without any additional terms or conditions.
