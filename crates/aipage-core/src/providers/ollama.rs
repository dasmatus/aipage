//! Ollama provider (local, native `/api/chat` + `/api/tags`). Mirrors `ollama.ts`.
//!
//! Local Ollama is addressed through its *native* API, not the OpenAI layer,
//! to keep the exact behaviour of the TS build (`/api/tags` lists models,
//! `/api/chat` returns `message.content`). The shared [`super::openai_compat`]
//! config [`CONFIG`] still describes this backend (default URL / model /
//! label) and is what provider-agnostic OpenAI-shaped paths such as SVG image
//! generation use for it.

use serde_json::{json, Value};

use super::openai_compat::{chat_messages, json_headers, OpenAiCompat, OLLAMA};
use super::{ModelInfo, SendOptions};
use crate::proxy::{perform_request, post_json};
use crate::types::SYSTEM_PROMPT;

/// The static config describing this backend.
pub const CONFIG: &OpenAiCompat = &OLLAMA;

fn base_url(opts: &SendOptions) -> String {
    opts.base_url
        .as_deref()
        .filter(|s| !s.is_empty())
        .unwrap_or(CONFIG.default_base_url)
        .to_string()
}

pub async fn send_message(prompt: &str, _api_key: &str, opts: &SendOptions) -> Result<String, String> {
    let url = format!("{}/api/chat", base_url(opts));
    let body = json!({
        "model": CONFIG.model_of(opts),
        "messages": chat_messages(SYSTEM_PROMPT, prompt),
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

/// Model names from a `/api/tags` response (`{ "models": [ { "name": ... } ] }`).
fn parse_tag_names(data: &Value) -> Vec<String> {
    data.get("models")
        .and_then(Value::as_array)
        .map(|arr| {
            arr.iter()
                .filter_map(|m| m.get("name").and_then(Value::as_str))
                .map(str::to_string)
                .collect()
        })
        .unwrap_or_default()
}

pub async fn get_models(opts: &SendOptions) -> Vec<ModelInfo> {
    let url = format!("{}/api/tags", base_url(opts));
    match perform_request(&url, "GET", &json_headers(), None).await {
        Ok(data) => parse_tag_names(&data)
            .into_iter()
            .map(|name| ModelInfo { id: name, provider: CONFIG.label.to_string() })
            .collect(),
        Err(e) => {
            aipage_bindings::console::error(format!("Failed to fetch {} models: {e}", CONFIG.label));
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

    #[test]
    fn parses_tag_names() {
        let data = json!({ "models": [ { "name": "llama3:latest" }, { "size": 1 } ] });
        assert_eq!(parse_tag_names(&data), vec!["llama3:latest"]);
        assert!(parse_tag_names(&json!({})).is_empty());
    }

    #[test]
    fn base_url_defaults_to_local_ollama() {
        assert_eq!(base_url(&SendOptions::default()), "http://localhost:11434");
        let custom = SendOptions { base_url: Some("http://box:11434".into()), model_name: None };
        assert_eq!(base_url(&custom), "http://box:11434");
        assert_eq!(CONFIG.model_of(&SendOptions::default()), "llama3");
    }
}
