# Changelog

All notable changes to the EduPage AI Sidebar extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2026-02-07

### Features

- **Multi-Browser Support**: Extension now works on Chrome, Firefox, and Safari
- **Cross-Browser Polyfill**: Added webextension-polyfill for API normalization
- **Browser-Specific Builds**: Separate build targets for each browser
- **GitLab CI/CD**: Complete pipeline with lint, build, test, and package stages
- **Safari Xcode Integration**: Setup script for Safari extension development

### Build System

- Multi-target build system with `--target` flag
- Browser-specific manifests for Chrome, Firefox, and Safari
- Automated packaging for Chrome (.zip) and Firefox (.xpi)

### Documentation

- Updated README with multi-browser installation instructions
- Enhanced CONTRIBUTING.md with cross-browser testing workflow
- Updated GEMINI.md with cross-browser architecture details

## [1.0.0] - 2026-02-05

### Features

- Initial release of EduPage AI Sidebar
- Multi-provider AI support (Gemini, ChatGPT, Claude, Mistral, LM Studio, Ollama)
- Clean, responsive sidebar UI
- Anti-cheat protection during tests
- Local API key storage
- Real-time AI chat integration
