//! OpenRouter provider (OpenAI-compatible REST API over many upstream models).
//!
//! Endpoints live under `https://openrouter.ai/api/v1` (`/chat/completions`,
//! `/models`) and are authenticated with `Authorization: Bearer <key>` (keys
//! from `https://openrouter.ai/keys`). Model ids are `vendor/model`, e.g.
//! `openai/gpt-4.1-mini`. OpenRouter accepts OpenAI-style function tools, so
//! the agentic chat + native web search loop in [`crate::agent`] works as-is.
//! Everything is delegated to [`super::openai_compat`] via [`CONFIG`], which
//! also adds OpenRouter's optional `HTTP-Referer` / `X-Title` attribution.

use super::openai_compat::{OpenAiCompat, OPENROUTER};
use super::{ModelInfo, SendOptions};
use crate::types::ProviderType;

/// The static config this module forwards to.
pub const CONFIG: &OpenAiCompat = &OPENROUTER;

pub async fn send_message(prompt: &str, api_key: &str, opts: &SendOptions) -> Result<String, String> {
    CONFIG.send_message(prompt, api_key, opts).await
}

pub async fn get_models(api_key: &str, opts: &SendOptions) -> Vec<ModelInfo> {
    CONFIG.get_models(api_key, opts).await
}

/// Native web search via the shared tool-calling loop (see
/// [`super::ollama_cloud::web_search`]).
pub async fn web_search(query: &str, api_key: &str, opts: &SendOptions) -> Result<String, String> {
    crate::agent::web_search(ProviderType::OpenRouter, api_key, query, opts).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_base_url_with_or_without_v1() {
        let with_v1 = SendOptions { base_url: Some("https://openrouter.ai/api/v1".into()), model_name: None };
        let without = SendOptions { base_url: Some("https://openrouter.ai/api".into()), model_name: None };
        let expected = "https://openrouter.ai/api/v1/chat/completions";
        assert_eq!(CONFIG.chat_url(&with_v1), expected);
        assert_eq!(CONFIG.chat_url(&without), expected);
        assert_eq!(CONFIG.chat_url(&SendOptions::default()), expected);
        assert_eq!(CONFIG.models_url(&SendOptions::default()), "https://openrouter.ai/api/v1/models");
    }

    #[test]
    fn sends_attribution_headers_and_bearer() {
        let h = CONFIG.headers("sk-or-v1-abc");
        assert_eq!(h.get("Authorization").map(String::as_str), Some("Bearer sk-or-v1-abc"));
        assert_eq!(h.get("HTTP-Referer").map(String::as_str), Some("https://github.com/dasmatus/aipage"));
        assert_eq!(h.get("X-Title").map(String::as_str), Some("AIPage"));
    }
}
