# API Reference

The full TypeScript API documentation is generated using TypeDoc and available separately.

**[View API Documentation](../api/index.html)**

The API reference includes:

- **Modules**: All TypeScript files and exports
- **Classes**: React components, providers, and managers
- **Interfaces**: Type definitions for providers, storage, and messages
- **Functions**: Utility functions and helpers
- **Types**: Custom type definitions

## Key Components

### Providers

The extension supports multiple AI providers through a unified interface:

- `AIProvider` - Base interface for all providers
- Provider implementations for Gemini, ChatGPT, Claude, etc.
- See [providers.ts API docs](../api/modules/sidebar_providers.html) for details

### Storage

Local storage management for API keys and settings:

- `storage` module from browser polyfill
- Persistent settings across browser restarts
- See [storage API docs](../api/modules/polyfills_browser_polyfill.html) for details

### Chat Manager

Handles AI chat interactions and response streaming:

- Message management
- Markdown rendering
- Streaming responses
- See [chat-manager.ts API docs](../api/modules/sidebar_chat_manager.html) for details

## Documentation Format

The API documentation uses TypeDoc to generate comprehensive references from:

- TypeScript type signatures
- JSDoc comments
- Interface definitions
- Code examples

For the complete API reference with all classes, interfaces, and functions, visit the [TypeDoc documentation](../api/index.html).
