//! Shared client for OpenAI-compatible backends (`/v1/chat/completions` +
//! `/v1/models` with `Authorization: Bearer <key>`).
//!
//! Ollama Cloud, OpenRouter, LM Studio and local Ollama all expose this shape;
//! they differ only in base URL, default model, display label and any extra
//! headers. Each concrete provider module declares one [`OpenAiCompat`]
//! constant and forwards to the methods here, and the tool-calling loop in
//! [`crate::agent`] and the SVG image generator in [`crate::imagegen`] are
//! written against this config so they work for every compatible provider.
//!
//! Pure helpers (URL normalisation, header building, response parsing) have no
//! wasm dependencies and are unit-tested natively.

use std::collections::HashMap;

use serde_json::{json, Value};

use super::{ModelInfo, SendOptions};
use crate::proxy::{perform_request, post_json};
use crate::types::{ProviderType, SYSTEM_PROMPT};

/// Static description of one OpenAI-compatible backend.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct OpenAiCompat {
    /// Human-readable name shown next to model ids in the picker and in logs.
    pub label: &'static str,
    /// Base URL used when the user left the field empty. `/v1/...` is appended
    /// to it, so it must *not* end in `/v1`.
    pub default_base_url: &'static str,
    /// Model id used when the user has not picked one.
    pub default_model: &'static str,
    /// Extra request headers (e.g. OpenRouter's attribution headers).
    pub extra_headers: &'static [(&'static str, &'static str)],
}

/// Hosted Ollama (`https://ollama.com/v1`, keys from ollama.com/settings/keys).
pub const OLLAMA_CLOUD: OpenAiCompat = OpenAiCompat {
    label: "Ollama Cloud",
    default_base_url: "https://ollama.com",
    default_model: "gpt-oss:120b-cloud",
    extra_headers: &[],
};

/// OpenRouter (`https://openrouter.ai/api/v1`). The attribution headers are
/// optional but let OpenRouter list the app on the model's usage page.
pub const OPENROUTER: OpenAiCompat = OpenAiCompat {
    label: "OpenRouter",
    default_base_url: "https://openrouter.ai/api",
    default_model: "openai/gpt-4.1-mini",
    extra_headers: &[
        ("HTTP-Referer", "https://github.com/dasmatus/aipage"),
        ("X-Title", "AIPage"),
    ],
};

/// Claude. The extension talks to Claude over the Anthropic Messages API
/// (see [`super::anthropic`]), not this client; this config only exists so
/// that [`OpenAiCompat::for_provider`] stays total — it supplies the label
/// and default model for model resolution (e.g. the SVG model picker).
/// Callers that would POST `/v1/chat/completions` must branch on
/// [`ProviderType::Anthropic`] first (the agent loop and image generator do).
pub const ANTHROPIC: OpenAiCompat = OpenAiCompat {
    label: super::anthropic::LABEL,
    default_base_url: super::anthropic::DEFAULT_BASE_URL,
    default_model: super::anthropic::DEFAULT_MODEL,
    extra_headers: &[],
};

/// LM Studio's local inference server.
pub const LMSTUDIO: OpenAiCompat = OpenAiCompat {
    label: "LM Studio",
    default_base_url: "http://localhost:1234",
    default_model: "local-model",
    extra_headers: &[],
};

/// Local Ollama's OpenAI-compatible layer (`http://localhost:11434/v1`). Chat
/// and model listing for [`ProviderType::Ollama`] still use Ollama's native
/// `/api/*` endpoints (see [`super::ollama`]); this config serves the paths
/// that are OpenAI-shaped for every provider, e.g. SVG image generation.
pub const OLLAMA: OpenAiCompat = OpenAiCompat {
    label: "Ollama",
    default_base_url: "http://localhost:11434",
    default_model: "llama3",
    extra_headers: &[],
};

impl OpenAiCompat {
    /// The config for a provider. Total: every OpenAI-compatible provider has
    /// its real config, and Claude gets the label/default-model stub
    /// [`ANTHROPIC`] (its requests go through [`super::anthropic`]).
    pub fn for_provider(p: ProviderType) -> &'static OpenAiCompat {
        match p {
            ProviderType::OllamaCloud => &OLLAMA_CLOUD,
            ProviderType::OpenRouter => &OPENROUTER,
            ProviderType::Anthropic => &ANTHROPIC,
            ProviderType::Lmstudio => &LMSTUDIO,
            ProviderType::Ollama => &OLLAMA,
        }
    }

    /// Normalise a user-entered base URL: empty → default, websocket schemes
    /// → HTTP, and a trailing `/` or `/v1` stripped so callers can rebuild
    /// `/v1/...` themselves (`https://openrouter.ai/api/v1` →
    /// `https://openrouter.ai/api`).
    pub fn normalize_base_url(&self, raw: &str) -> String {
        let raw = raw.trim();
        let mut base = if raw.is_empty() { self.default_base_url.to_string() } else { raw.to_string() };
        if let Some(rest) = base.strip_prefix("ws://") {
            base = format!("http://{rest}");
        } else if let Some(rest) = base.strip_prefix("wss://") {
            base = format!("https://{rest}");
        }
        if let Some(stripped) = base.strip_suffix('/') {
            base = stripped.to_string();
        }
        if let Some(stripped) = base.strip_suffix("/v1") {
            base = stripped.to_string();
        }
        base
    }

    pub fn base_url(&self, opts: &SendOptions) -> String {
        self.normalize_base_url(opts.base_url.as_deref().unwrap_or(""))
    }

    pub fn chat_url(&self, opts: &SendOptions) -> String {
        format!("{}/v1/chat/completions", self.base_url(opts))
    }

    pub fn models_url(&self, opts: &SendOptions) -> String {
        format!("{}/v1/models", self.base_url(opts))
    }

    /// The model to request: the user's choice, else this provider's default.
    pub fn model_of(&self, opts: &SendOptions) -> String {
        opts.model_name
            .as_deref()
            .filter(|s| !s.is_empty())
            .unwrap_or(self.default_model)
            .to_string()
    }

    /// `Content-Type: application/json`, the provider's extra headers, and
    /// `Authorization: Bearer <api_key>` when a key is present. Local backends
    /// pass an empty key and get no auth header.
    pub fn headers(&self, api_key: &str) -> HashMap<String, String> {
        let mut h = json_headers();
        for (k, v) in self.extra_headers {
            h.insert((*k).to_string(), (*v).to_string());
        }
        if !api_key.is_empty() {
            h.insert("Authorization".to_string(), format!("Bearer {api_key}"));
        }
        h
    }

    /// One-shot chat completion: system prompt + user prompt, no tools.
    pub async fn send_message(&self, prompt: &str, api_key: &str, opts: &SendOptions) -> Result<String, String> {
        let body = json!({
            "model": self.model_of(opts),
            "messages": chat_messages(SYSTEM_PROMPT, prompt),
            "temperature": 0.7,
            "stream": false,
        });
        let data = post_json(&self.chat_url(opts), &self.headers(api_key), &body).await?;
        Ok(parse_completion_text(&data))
    }

    /// `GET /v1/models`, mapped to [`ModelInfo`]s labelled with this provider.
    /// Empty on error (matching the old TS behaviour).
    pub async fn get_models(&self, api_key: &str, opts: &SendOptions) -> Vec<ModelInfo> {
        self.fetch_models(&self.models_url(opts), api_key).await
    }

    /// Like [`Self::get_models`] but against an explicit URL, for providers
    /// that derive the models URL differently (see [`super::lmstudio`]).
    pub async fn fetch_models(&self, url: &str, api_key: &str) -> Vec<ModelInfo> {
        match perform_request(url, "GET", &self.headers(api_key), None).await {
            Ok(data) => self.models_from(&data),
            Err(e) => {
                aipage_bindings::console::error(format!("Failed to fetch {} models: {e}", self.label));
                Vec::new()
            }
        }
    }

    /// Map a `/v1/models` response body to [`ModelInfo`]s for this provider.
    pub fn models_from(&self, data: &Value) -> Vec<ModelInfo> {
        parse_model_ids(data)
            .into_iter()
            .map(|id| ModelInfo { id, provider: self.label.to_string() })
            .collect()
    }
}

/// `Content-Type: application/json` only.
pub fn json_headers() -> HashMap<String, String> {
    let mut h = HashMap::new();
    h.insert("Content-Type".to_string(), "application/json".to_string());
    h
}

/// The two-message `[system, user]` array used by every one-shot request.
pub fn chat_messages(system: &str, user: &str) -> Value {
    json!([
        { "role": "system", "content": system },
        { "role": "user", "content": user }
    ])
}

/// `data.choices[0].message.content`, defaulting to "No response".
pub fn parse_completion_text(data: &Value) -> String {
    data.pointer("/choices/0/message/content")
        .and_then(Value::as_str)
        .filter(|s| !s.is_empty())
        .unwrap_or("No response")
        .to_string()
}

/// The `id`s in a `/v1/models` response (`{ "data": [ { "id": ... } ] }`).
pub fn parse_model_ids(data: &Value) -> Vec<String> {
    data.get("data")
        .and_then(Value::as_array)
        .map(|arr| {
            arr.iter()
                .filter_map(|m| m.get("id").and_then(Value::as_str))
                .map(str::to_string)
                .collect()
        })
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn for_provider_covers_every_provider() {
        assert_eq!(OpenAiCompat::for_provider(ProviderType::OllamaCloud).label, "Ollama Cloud");
        assert_eq!(OpenAiCompat::for_provider(ProviderType::OpenRouter).label, "OpenRouter");
        assert_eq!(OpenAiCompat::for_provider(ProviderType::Anthropic).label, "Claude (Anthropic)");
        assert_eq!(OpenAiCompat::for_provider(ProviderType::Anthropic).default_model, "claude-opus-5-5");
        assert_eq!(OpenAiCompat::for_provider(ProviderType::Lmstudio).label, "LM Studio");
        assert_eq!(OpenAiCompat::for_provider(ProviderType::Ollama).label, "Ollama");
    }

    #[test]
    fn default_base_urls_do_not_end_in_v1() {
        for cfg in [OLLAMA_CLOUD, OPENROUTER, ANTHROPIC, LMSTUDIO, OLLAMA] {
            assert!(!cfg.default_base_url.ends_with("/v1"), "{}", cfg.label);
            assert!(!cfg.default_base_url.ends_with('/'), "{}", cfg.label);
        }
    }

    #[test]
    fn normalizes_base_urls() {
        assert_eq!(OPENROUTER.normalize_base_url(""), "https://openrouter.ai/api");
        assert_eq!(OPENROUTER.normalize_base_url("https://openrouter.ai/api/v1"), "https://openrouter.ai/api");
        assert_eq!(OPENROUTER.normalize_base_url("https://openrouter.ai/api/v1/"), "https://openrouter.ai/api");
        assert_eq!(OPENROUTER.normalize_base_url("https://openrouter.ai/api/"), "https://openrouter.ai/api");
        assert_eq!(OPENROUTER.normalize_base_url("  https://openrouter.ai/api  "), "https://openrouter.ai/api");
        assert_eq!(LMSTUDIO.normalize_base_url("ws://localhost:1234"), "http://localhost:1234");
        assert_eq!(LMSTUDIO.normalize_base_url("wss://host:9/v1"), "https://host:9");
    }

    #[test]
    fn urls_are_built_from_normalized_base() {
        let opts = SendOptions { base_url: Some("https://openrouter.ai/api/v1".into()), model_name: None };
        assert_eq!(OPENROUTER.chat_url(&opts), "https://openrouter.ai/api/v1/chat/completions");
        assert_eq!(OPENROUTER.models_url(&opts), "https://openrouter.ai/api/v1/models");
        assert_eq!(OLLAMA_CLOUD.chat_url(&SendOptions::default()), "https://ollama.com/v1/chat/completions");
    }

    #[test]
    fn model_of_falls_back_to_provider_default() {
        assert_eq!(OPENROUTER.model_of(&SendOptions::default()), "openai/gpt-4.1-mini");
        assert_eq!(OPENROUTER.model_of(&SendOptions::with_model("")), "openai/gpt-4.1-mini");
        assert_eq!(OPENROUTER.model_of(&SendOptions::with_model("x/y")), "x/y");
        assert_eq!(OLLAMA_CLOUD.model_of(&SendOptions::default()), "gpt-oss:120b-cloud");
    }

    #[test]
    fn headers_include_bearer_and_extras() {
        let h = OPENROUTER.headers("sk-or-abc");
        assert_eq!(h.get("Authorization").map(String::as_str), Some("Bearer sk-or-abc"));
        assert_eq!(h.get("Content-Type").map(String::as_str), Some("application/json"));
        assert_eq!(h.get("HTTP-Referer").map(String::as_str), Some("https://github.com/dasmatus/aipage"));
        assert_eq!(h.get("X-Title").map(String::as_str), Some("AIPage"));
    }

    #[test]
    fn headers_omit_bearer_when_key_empty() {
        let h = LMSTUDIO.headers("");
        assert!(!h.contains_key("Authorization"));
        assert_eq!(h.len(), 1);
        assert!(!OLLAMA_CLOUD.headers("").contains_key("HTTP-Referer"));
    }

    #[test]
    fn parses_completion_text() {
        let data = json!({ "choices": [ { "message": { "content": "answer" } } ] });
        assert_eq!(parse_completion_text(&data), "answer");
        assert_eq!(parse_completion_text(&json!({ "choices": [] })), "No response");
        assert_eq!(parse_completion_text(&json!({ "choices": [ { "message": { "content": "" } } ] })), "No response");
    }

    #[test]
    fn parses_model_list() {
        let data = json!({ "data": [ { "id": "openai/gpt-4.1-mini" }, { "name": "no-id" }, { "id": "b" } ] });
        assert_eq!(parse_model_ids(&data), vec!["openai/gpt-4.1-mini", "b"]);
        assert!(parse_model_ids(&json!({})).is_empty());
        let infos = OPENROUTER.models_from(&data);
        assert_eq!(infos[0], ModelInfo { id: "openai/gpt-4.1-mini".into(), provider: "OpenRouter".into() });
    }

    #[test]
    fn chat_messages_shape() {
        let m = chat_messages("sys", "hi");
        assert_eq!(m[0]["role"], "system");
        assert_eq!(m[0]["content"], "sys");
        assert_eq!(m[1]["role"], "user");
        assert_eq!(m[1]["content"], "hi");
    }
}
