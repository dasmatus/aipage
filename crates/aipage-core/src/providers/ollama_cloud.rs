//! Ollama Cloud provider (hosted Ollama, OpenAI-compatible REST API).
//!
//! Cloud models are addressed via Ollama's OpenAI-compatible layer at
//! `https://ollama.com/v1` and authenticated with `Authorization: Bearer <key>`
//! (keys created at `https://ollama.com/settings/keys`). Cloud model ids carry
//! a `:cloud` suffix (e.g. `gpt-oss:120b-cloud`). Everything is delegated to
//! the shared [`super::openai_compat`] client via [`CONFIG`].

use super::openai_compat::{OpenAiCompat, OLLAMA_CLOUD};
use super::{ModelInfo, SendOptions};
use crate::types::ProviderType;

/// The static config this module forwards to.
pub const CONFIG: &OpenAiCompat = &OLLAMA_CLOUD;

pub async fn send_message(prompt: &str, api_key: &str, opts: &SendOptions) -> Result<String, String> {
    CONFIG.send_message(prompt, api_key, opts).await
}

pub async fn get_models(api_key: &str, opts: &SendOptions) -> Vec<ModelInfo> {
    CONFIG.get_models(api_key, opts).await
}

/// Native web search via a tool-calling round: the model is given a
/// `web_search` function tool and asked to answer the query, fetching results
/// through the background DuckDuckGo searcher as needed. Delegates to the
/// shared tool loop in [`crate::agent`].
pub async fn web_search(query: &str, api_key: &str, opts: &SendOptions) -> Result<String, String> {
    crate::agent::web_search(ProviderType::OllamaCloud, api_key, query, opts).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_base_urls() {
        assert_eq!(CONFIG.normalize_base_url(""), "https://ollama.com");
        assert_eq!(CONFIG.normalize_base_url("https://ollama.com/v1"), "https://ollama.com");
        assert_eq!(CONFIG.normalize_base_url("https://ollama.com"), "https://ollama.com");
        assert_eq!(CONFIG.normalize_base_url("wss://host:9/v1"), "https://host:9");
    }

    #[test]
    fn auth_headers_omit_bearer_when_key_empty() {
        assert!(!CONFIG.headers("").contains_key("Authorization"));
        assert!(CONFIG.headers("sk-xyz").get("Authorization").unwrap().starts_with("Bearer sk-xyz"));
    }

    #[test]
    fn default_model_is_a_cloud_model() {
        assert_eq!(CONFIG.model_of(&SendOptions::default()), "gpt-oss:120b-cloud");
    }
}
