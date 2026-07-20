//! AI providers. Mirrors `src/sidebar/providers/*`.
//!
//! Dispatch is by [`ProviderType`] rather than a `dyn` async trait (simpler in
//! single-threaded wasm). Network requests are routed through the background
//! CORS proxy via [`crate::proxy`]. Pure helpers (URL normalization, response
//! parsing) are split out so they can be unit-tested natively.

pub mod lmstudio;
pub mod ollama;
pub mod ollama_cloud;

use crate::types::ProviderType;

/// Per-request overrides (base URL / model), mirroring the TS `options` arg.
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

/// Send a chat message to the selected provider, returning the full text.
pub async fn send_message(
    provider: ProviderType,
    prompt: &str,
    api_key: &str,
    opts: &SendOptions,
) -> Result<String, String> {
    match provider {
        ProviderType::OllamaCloud => ollama_cloud::send_message(prompt, api_key, opts).await,
        ProviderType::Ollama => ollama::send_message(prompt, api_key, opts).await,
        ProviderType::Lmstudio => lmstudio::send_message(prompt, api_key, opts).await,
    }
}

/// Fetch the provider's available models (empty on error, matching the TS).
pub async fn get_models(
    provider: ProviderType,
    api_key: &str,
    opts: &SendOptions,
) -> Vec<ModelInfo> {
    match provider {
        ProviderType::OllamaCloud => ollama_cloud::get_models(api_key, opts).await,
        ProviderType::Ollama => ollama::get_models(opts).await,
        ProviderType::Lmstudio => lmstudio::get_models(opts).await,
    }
}

/// Native web search. Ollama Cloud implements it via a tool-calling round over
/// the background DuckDuckGo searcher; local providers return an error and the
/// sidebar falls back to its own DuckDuckGo + summarize path.
pub async fn web_search(
    provider: ProviderType,
    query: &str,
    api_key: &str,
    opts: &SendOptions,
) -> Result<String, String> {
    match provider {
        ProviderType::OllamaCloud => ollama_cloud::web_search(query, api_key, opts).await,
        _ => Err("This provider does not support native web search".to_string()),
    }
}