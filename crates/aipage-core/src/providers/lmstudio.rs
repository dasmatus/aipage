//! LM Studio provider (OpenAI-compatible REST API). Mirrors `lmstudio.ts`.

use std::collections::HashMap;

use serde_json::{json, Value};

use super::{ModelInfo, SendOptions};
use crate::proxy::{perform_request, post_json};
use crate::types::SYSTEM_PROMPT;

const DEFAULT_BASE_URL: &str = "http://localhost:1234";
const DEFAULT_MODEL: &str = "local-model";

/// Normalize the base URL: coerce websocket schemes to HTTP and strip a
/// trailing `/v1`. Mirrors the cleanup in `LMStudioProvider.sendMessage`.
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

/// Base URL for `getModels`: the TS `getModels` only strips a trailing `/v1`
/// (no ws→http coercion), unlike `sendMessage`. Mirror that exactly.
fn models_base_url(opts: &SendOptions) -> String {
    let raw = opts.base_url.as_deref().unwrap_or("");
    let mut base = if raw.is_empty() { DEFAULT_BASE_URL.to_string() } else { raw.to_string() };
    if let Some(stripped) = base.strip_suffix("/v1") {
        base = stripped.to_string();
    }
    base
}

fn json_headers() -> HashMap<String, String> {
    let mut h = HashMap::new();
    h.insert("Content-Type".to_string(), "application/json".to_string());
    h
}

pub async fn send_message(prompt: &str, _api_key: &str, opts: &SendOptions) -> Result<String, String> {
    let url = format!("{}/v1/chat/completions", base_url(opts));
    let model = opts.model_name.as_deref().filter(|s| !s.is_empty()).unwrap_or(DEFAULT_MODEL);
    let body = json!({
        "model": model,
        "messages": [
            { "role": "system", "content": SYSTEM_PROMPT },
            { "role": "user", "content": prompt }
        ],
        "temperature": 0.7,
        "stream": false,
    });
    let data = post_json(&url, &json_headers(), &body).await?;
    Ok(parse_completion_text(&data))
}

/// `data.choices[0].message.content`, defaulting to "No response".
fn parse_completion_text(data: &Value) -> String {
    data.pointer("/choices/0/message/content")
        .and_then(Value::as_str)
        .filter(|s| !s.is_empty())
        .unwrap_or("No response")
        .to_string()
}

pub async fn get_models(opts: &SendOptions) -> Vec<ModelInfo> {
    let url = format!("{}/v1/models", models_base_url(opts));
    match perform_request(&url, "GET", &HashMap::new(), None).await {
        Ok(data) => data
            .get("data")
            .and_then(Value::as_array)
            .map(|arr| {
                arr.iter()
                    .filter_map(|m| m.get("id").and_then(Value::as_str))
                    .map(|id| ModelInfo { id: id.to_string(), provider: "LM Studio".to_string() })
                    .collect()
            })
            .unwrap_or_default(),
        Err(e) => {
            aipage_bindings::console::error(format!("Failed to fetch LM Studio models: {e}"));
            Vec::new()
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_base_urls() {
        assert_eq!(normalize_base_url(""), "http://localhost:1234");
        assert_eq!(normalize_base_url("ws://localhost:1234"), "http://localhost:1234");
        assert_eq!(normalize_base_url("wss://host:9"), "https://host:9");
        assert_eq!(normalize_base_url("http://x:1/v1"), "http://x:1");
        assert_eq!(normalize_base_url("http://x:1"), "http://x:1");
    }

    #[test]
    fn models_base_url_only_strips_v1() {
        // getModels must NOT apply ws→http coercion (TS parity).
        assert_eq!(models_base_url(&SendOptions::default()), "http://localhost:1234");
        let ws = SendOptions { base_url: Some("ws://host:1/v1".into()), model_name: None };
        assert_eq!(models_base_url(&ws), "ws://host:1");
    }

    #[test]
    fn parses_completion_text() {
        let data = json!({ "choices": [ { "message": { "content": "answer" } } ] });
        assert_eq!(parse_completion_text(&data), "answer");
        assert_eq!(parse_completion_text(&json!({ "choices": [] })), "No response");
    }
}
