//! Ollama provider (local chat API). Mirrors `ollama.ts`.

use std::collections::HashMap;

use serde_json::{json, Value};

use super::{ModelInfo, SendOptions};
use crate::proxy::{perform_request, post_json};
use crate::types::SYSTEM_PROMPT;

const DEFAULT_BASE_URL: &str = "http://localhost:11434";
const DEFAULT_MODEL: &str = "llama3";

fn base_url(opts: &SendOptions) -> String {
    opts.base_url.as_deref().filter(|s| !s.is_empty()).unwrap_or(DEFAULT_BASE_URL).to_string()
}

fn json_headers() -> HashMap<String, String> {
    let mut h = HashMap::new();
    h.insert("Content-Type".to_string(), "application/json".to_string());
    h
}

pub async fn send_message(prompt: &str, _api_key: &str, opts: &SendOptions) -> Result<String, String> {
    let url = format!("{}/api/chat", base_url(opts));
    let model = opts.model_name.as_deref().filter(|s| !s.is_empty()).unwrap_or(DEFAULT_MODEL);
    let body = json!({
        "model": model,
        "messages": [
            { "role": "system", "content": SYSTEM_PROMPT },
            { "role": "user", "content": prompt }
        ],
        "stream": false,
    });
    let data = post_json(&url, &json_headers(), &body).await?;
    Ok(parse_chat_text(&data))
}

/// `data.message.content`, defaulting to "No response".
fn parse_chat_text(data: &Value) -> String {
    data.pointer("/message/content")
        .and_then(Value::as_str)
        .filter(|s| !s.is_empty())
        .unwrap_or("No response")
        .to_string()
}

pub async fn get_models(opts: &SendOptions) -> Vec<ModelInfo> {
    let url = format!("{}/api/tags", base_url(opts));
    match perform_request(&url, "GET", &HashMap::new(), None).await {
        Ok(data) => data
            .get("models")
            .and_then(Value::as_array)
            .map(|arr| {
                arr.iter()
                    .filter_map(|m| m.get("name").and_then(Value::as_str))
                    .map(|name| ModelInfo { id: name.to_string(), provider: "Ollama".to_string() })
                    .collect()
            })
            .unwrap_or_default(),
        Err(e) => {
            aipage_bindings::console::error(format!("Failed to fetch Ollama models: {e}"));
            Vec::new()
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_message_content() {
        let data = json!({ "message": { "content": "hi there" } });
        assert_eq!(parse_chat_text(&data), "hi there");
        assert_eq!(parse_chat_text(&json!({})), "No response");
    }
}
