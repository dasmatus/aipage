//! Ollama Cloud provider (hosted Ollama, OpenAI-compatible REST API).
//!
//! Cloud models are addressed via Ollama's OpenAI-compatible layer at
//! `https://ollama.com/v1` and authenticated with `Authorization: Bearer <key>`
//! (keys created at `https://ollama.com/settings/keys`). Cloud model ids carry
//! a `:cloud` suffix (e.g. `gpt-oss:120b-cloud`). The request/response shape is
//! the same as [`super::lmstudio`] — this module only adds auth + cloud defaults.

use std::collections::HashMap;

use serde_json::{json, Value};

use super::{ModelInfo, SendOptions};
use crate::proxy::{perform_request, post_json};
use crate::types::SYSTEM_PROMPT;

const DEFAULT_BASE_URL: &str = "https://ollama.com";
const DEFAULT_MODEL: &str = "gpt-oss:120b-cloud";

/// Normalize the base URL: coerce websocket schemes to HTTP and strip a
/// trailing `/v1` so callers can rebuild `/v1/...` themselves. Mirrors
/// [`super::lmstudio::normalize_base_url`].
pub(crate) fn normalize_base_url(raw: &str) -> String {
    let mut base = if raw.is_empty() { DEFAULT_BASE_URL.to_string() } else { raw.to_string() };
    if let Some(rest) = base.strip_prefix("ws://") {
        base = format!("http://{rest}");
    } else if let Some(rest) = base.strip_prefix("wss://") {
        base = format!("https://{rest}");
    }
    if let Some(stripped) = base.strip_suffix("/v1") {
        base = stripped.to_string();
    }
    base
}

fn base_url(opts: &SendOptions) -> String {
    normalize_base_url(opts.base_url.as_deref().unwrap_or(""))
}

/// `Content-Type: application/json` plus `Authorization: Bearer <api_key>` when a
/// key is present. Local backends calling the same OpenAI-compatible path pass
/// an empty key and get a headerless request (Ollama ignores the header).
pub(crate) fn auth_headers(api_key: &str) -> HashMap<String, String> {
    let mut h = HashMap::new();
    h.insert("Content-Type".to_string(), "application/json".to_string());
    if !api_key.is_empty() {
        h.insert("Authorization".to_string(), format!("Bearer {api_key}"));
    }
    h
}

pub(crate) fn chat_url(opts: &SendOptions) -> String {
    format!("{}/v1/chat/completions", base_url(opts))
}

fn models_url(opts: &SendOptions) -> String {
    format!("{}/v1/models", base_url(opts))
}

pub(crate) fn model_of(opts: &SendOptions) -> String {
    opts.model_name.as_deref().filter(|s| !s.is_empty()).unwrap_or(DEFAULT_MODEL).to_string()
}

/// `data.choices[0].message.content`, defaulting to "No response".
fn parse_completion_text(data: &Value) -> String {
    data.pointer("/choices/0/message/content")
        .and_then(Value::as_str)
        .filter(|s| !s.is_empty())
        .unwrap_or("No response")
        .to_string()
}

pub async fn send_message(prompt: &str, api_key: &str, opts: &SendOptions) -> Result<String, String> {
    let url = chat_url(opts);
    let body = json!({
        "model": model_of(opts),
        "messages": [
            { "role": "system", "content": SYSTEM_PROMPT },
            { "role": "user", "content": prompt }
        ],
        "temperature": 0.7,
        "stream": false,
    });
    let data = post_json(&url, &auth_headers(api_key), &body).await?;
    Ok(parse_completion_text(&data))
}

pub async fn get_models(api_key: &str, opts: &SendOptions) -> Vec<ModelInfo> {
    let url = models_url(opts);
    match perform_request(&url, "GET", &auth_headers(api_key), None).await {
        Ok(data) => data
            .get("data")
            .and_then(Value::as_array)
            .map(|arr| {
                arr.iter()
                    .filter_map(|m| m.get("id").and_then(Value::as_str))
                    .map(|id| ModelInfo { id: id.to_string(), provider: "Ollama Cloud".to_string() })
                    .collect()
            })
            .unwrap_or_default(),
        Err(e) => {
            aipage_bindings::console::error(format!("Failed to fetch Ollama Cloud models: {e}"));
            Vec::new()
        }
    }
}

/// Native web search via an Ollama tool-calling round: the model is given a
/// `web_search` function tool and asked to answer the query, fetching results
/// through the background DuckDuckGo searcher as needed. Delegates to the
/// shared tool loop in [`crate::agent`].
pub async fn web_search(query: &str, api_key: &str, opts: &SendOptions) -> Result<String, String> {
    crate::agent::web_search(api_key, query, opts).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_base_urls() {
        assert_eq!(normalize_base_url(""), "https://ollama.com");
        assert_eq!(normalize_base_url("https://ollama.com/v1"), "https://ollama.com");
        assert_eq!(normalize_base_url("https://ollama.com"), "https://ollama.com");
        assert_eq!(normalize_base_url("wss://host:9/v1"), "https://host:9");
    }

    #[test]
    fn auth_headers_omit_bearer_when_key_empty() {
        assert!(!auth_headers("").contains_key("Authorization"));
        assert!(auth_headers("sk-xyz").get("Authorization").unwrap().starts_with("Bearer sk-xyz"));
    }

    #[test]
    fn parses_completion_text() {
        let data = json!({ "choices": [ { "message": { "content": "answer" } } ] });
        assert_eq!(parse_completion_text(&data), "answer");
        assert_eq!(parse_completion_text(&json!({ "choices": [] })), "No response");
    }
}