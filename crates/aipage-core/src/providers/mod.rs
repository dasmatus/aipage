//! AI providers.
//!
//! Dispatch is by [`ProviderType`] rather than a `dyn` async trait (simpler in
//! single-threaded wasm). Network requests go through the background CORS
//! proxy via [`crate::proxy`]. Pure helpers (URL normalisation, response
//! parsing) are kept separate so they can be unit-tested natively.
//!
//! OpenAI-compatible backends (Ollama Cloud, OpenRouter, OpenAI, LM Studio
//! and local Ollama's `/v1` layer) share one client,
//! [`openai_compat::OpenAiCompat`], selected per provider by
//! [`OpenAiCompat::for_provider`]. Claude ([`anthropic`]) speaks the Anthropic
//! Messages API and owns its wire format; local Ollama ([`ollama`]) uses its
//! native `/api/*` endpoints for chat and model listing.
//!
//! # Adding a provider
//!
//! 1. **`types.rs`** — add the [`ProviderType`] variant with its
//!    `#[serde(rename = "...")]` stored string; extend `as_str`,
//!    `display_name`, `from_str_or_default`, `is_local` and
//!    `supports_native_tools` (true when the backend accepts OpenAI-style
//!    function tools, which enables the agentic chat + native web-search
//!    loop); extend the tests.
//! 2. **`storage.rs`** — add the `<name>_api_key`, `<name>_base_url` and
//!    `<name>_model` keys to `api_key_key` and `local_settings_keys`. Keys are
//!    the persisted contract; never rename them.
//! 3. **The client.** For an OpenAI-compatible backend declare one
//!    `OpenAiCompat` const in [`openai_compat`] (label, default base URL
//!    *without* `/v1`, default model, extra headers) and add it to
//!    `OpenAiCompat::for_provider`; [`send_message`], [`get_models`],
//!    [`web_search`], [`default_base_url`], the agent loop and the image
//!    generator all go through that config. A model-list filter (see
//!    [`openai`]) or another wire format (see [`anthropic`]) gets its own
//!    module and a match arm in the dispatchers below.
//! 4. **`i18n.rs` + `locales/{sk,en,cs,de,hu}.json`** — add `provider<Name>`,
//!    `<name>ApiKey`, `<name>ApiKeyPlaceholder` and `<name>ApiKeyHint` to all
//!    five files and the `Translation` struct (the locale test fails
//!    otherwise).
//! 5. **`aipage-sidebar/src/components/settings.rs`** — an `<option>` in the
//!    engine `<select>` and an arm in `api_key_strings`.
//! 6. **`assets/manifest.{chrome,firefox,safari}.json`** — add the API host to
//!    `permissions` and to the CSP `connect-src`; the background proxy has no
//!    allow-list of its own, the browser enforces the manifest.
//! 7. **Docs** — README "Supported Providers" plus a setup subsection, and
//!    `CHANGELOG.md` under "Unreleased".

pub mod anthropic;
pub mod lmstudio;
pub mod ollama;
pub mod openai;
pub mod openai_compat;

use crate::types::ProviderType;
use openai_compat::OpenAiCompat;

/// Per-request overrides (base URL / model).
#[derive(Clone, Debug, Default)]
pub struct SendOptions {
    pub base_url: Option<String>,
    pub model_name: Option<String>,
}

impl SendOptions {
    pub fn with_model(model: impl Into<String>) -> Self {
        Self { base_url: None, model_name: Some(model.into()) }
    }
}

/// A model entry as surfaced to the settings model picker.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ModelInfo {
    pub id: String,
    pub provider: String,
}

/// The base URL pre-filled in the settings form when the user has not saved
/// one. LM Studio shows the `/v1` suffix (as its own UI does); every client
/// strips it again before building `/v1/...` paths.
pub fn default_base_url(provider: ProviderType) -> &'static str {
    match provider {
        ProviderType::Lmstudio => "http://localhost:1234/v1",
        p => OpenAiCompat::for_provider(p).default_base_url,
    }
}

/// Send a chat message to the selected provider, returning the full text.
pub async fn send_message(
    provider: ProviderType,
    prompt: &str,
    api_key: &str,
    opts: &SendOptions,
) -> Result<String, String> {
    match provider {
        ProviderType::Anthropic => anthropic::send_message(prompt, api_key, opts).await,
        ProviderType::Ollama => ollama::send_message(prompt, opts).await,
        // Local backends never send an auth header, even with a stored key.
        ProviderType::Lmstudio => lmstudio::CONFIG.send_message(prompt, "", opts).await,
        p => OpenAiCompat::for_provider(p).send_message(prompt, api_key, opts).await,
    }
}

/// Fetch the provider's available models (empty on error).
pub async fn get_models(
    provider: ProviderType,
    api_key: &str,
    opts: &SendOptions,
) -> Vec<ModelInfo> {
    match provider {
        ProviderType::Anthropic => anthropic::get_models(api_key, opts).await,
        ProviderType::Ollama => ollama::get_models(opts).await,
        ProviderType::Lmstudio => lmstudio::get_models(opts).await,
        ProviderType::OpenAi => openai::get_models(api_key, opts).await,
        p => OpenAiCompat::for_provider(p).get_models(api_key, opts).await,
    }
}

/// Native web search. Tool-capable providers run a tool-calling round over
/// the background DuckDuckGo searcher (Claude uses its server-side
/// `web_search` tool); local providers return an error and the sidebar falls
/// back to its own DuckDuckGo + summarize path.
pub async fn web_search(
    provider: ProviderType,
    query: &str,
    api_key: &str,
    opts: &SendOptions,
) -> Result<String, String> {
    if provider.supports_native_tools() {
        crate::agent::web_search(provider, api_key, query, opts).await
    } else {
        Err("This provider does not support native web search".to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_base_urls_per_provider() {
        assert_eq!(default_base_url(ProviderType::OllamaCloud), "https://ollama.com");
        assert_eq!(default_base_url(ProviderType::OpenRouter), "https://openrouter.ai/api");
        assert_eq!(default_base_url(ProviderType::OpenAi), "https://api.openai.com");
        assert_eq!(default_base_url(ProviderType::Anthropic), "https://api.anthropic.com");
        assert_eq!(default_base_url(ProviderType::Lmstudio), "http://localhost:1234/v1");
        assert_eq!(default_base_url(ProviderType::Ollama), "http://localhost:11434");
    }
}
