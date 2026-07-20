//! Claude provider. Replaces `@anthropic-ai/sdk` with direct REST calls to the
//! Messages API, routed through the background proxy. Mirrors `anthropic.ts`.

use std::collections::HashMap;

use serde_json::{json, Value};

use super::{ModelInfo, SendOptions};
use crate::proxy::{perform_request, post_json};
use crate::types::SYSTEM_PROMPT;

const DEFAULT_MODEL: &str = "claude-opus-4-8";
const MESSAGES_URL: &str = "https://api.anthropic.com/v1/messages";
const MODELS_URL: &str = "https://api.anthropic.com/v1/models";
const MAX_TOKENS: u32 = 16000;

fn headers(api_key: &str) -> HashMap<String, String> {
    let mut h = HashMap::new();
    h.insert("content-type".to_string(), "application/json".to_string());
    h.insert("x-api-key".to_string(), api_key.to_string());
    h.insert("anthropic-version".to_string(), "2023-06-01".to_string());
    h
}

fn model_of(opts: &SendOptions) -> &str {
    opts.model_name.as_deref().filter(|s| !s.is_empty()).unwrap_or(DEFAULT_MODEL)
}

/// Join the `text` blocks of a Messages API response, defaulting to "No response".
pub(crate) fn extract_text(resp: &Value) -> String {
    let text: String = resp
        .get("content")
        .and_then(Value::as_array)
        .map(|blocks| {
            blocks
                .iter()
                .filter(|b| b.get("type").and_then(Value::as_str) == Some("text"))
                .filter_map(|b| b.get("text").and_then(Value::as_str))
                .collect::<String>()
        })
        .unwrap_or_default();
    if text.is_empty() {
        "No response".to_string()
    } else {
        text
    }
}

pub async fn send_message(prompt: &str, api_key: &str, opts: &SendOptions) -> Result<String, String> {
    let body = json!({
        "model": model_of(opts),
        "max_tokens": MAX_TOKENS,
        "system": SYSTEM_PROMPT,
        "messages": [{ "role": "user", "content": prompt }],
    });
    let resp = post_json(MESSAGES_URL, &headers(api_key), &body).await?;
    Ok(extract_text(&resp))
}

/// Claude's server-side `web_search` tool. Resumes on `pause_turn` (max 5).
pub async fn web_search(query: &str, api_key: &str, opts: &SendOptions) -> Result<String, String> {
    let model = model_of(opts).to_string();
    let tools = json!([{ "type": "web_search_20260209", "name": "web_search" }]);
    let h = headers(api_key);
    let mut messages = vec![json!({ "role": "user", "content": query })];

    let request = |messages: &Vec<Value>| {
        json!({
            "model": model,
            "max_tokens": MAX_TOKENS,
            "system": SYSTEM_PROMPT,
            "messages": messages,
            "tools": tools,
        })
    };

    let mut response = post_json(MESSAGES_URL, &h, &request(&messages)).await?;
    let mut guard = 0;
    while response.get("stop_reason").and_then(Value::as_str) == Some("pause_turn") && guard < 5 {
        guard += 1;
        if let Some(content) = response.get("content").cloned() {
            messages.push(json!({ "role": "assistant", "content": content }));
        }
        response = post_json(MESSAGES_URL, &h, &request(&messages)).await?;
    }
    Ok(extract_text(&response))
}

/// Auto-paginated `models.list()`.
pub async fn get_models(api_key: &str) -> Vec<ModelInfo> {
    if api_key.is_empty() {
        return Vec::new();
    }
    let h = headers(api_key);
    let mut out = Vec::new();
    let mut after: Option<String> = None;
    loop {
        let url = match &after {
            Some(id) => format!("{MODELS_URL}?limit=100&after_id={id}"),
            None => format!("{MODELS_URL}?limit=100"),
        };
        let resp = match perform_request(&url, "GET", &h, None).await {
            Ok(v) => v,
            Err(e) => {
                aipage_bindings::console::error(format!("Failed to fetch Anthropic models: {e}"));
                break;
            }
        };
        if let Some(arr) = resp.get("data").and_then(Value::as_array) {
            for m in arr {
                if let Some(id) = m.get("id").and_then(Value::as_str) {
                    out.push(ModelInfo { id: id.to_string(), provider: "Anthropic".to_string() });
                }
            }
        }
        let has_more = resp.get("has_more").and_then(Value::as_bool).unwrap_or(false);
        let last_id = resp.get("last_id").and_then(Value::as_str).map(str::to_string);
        match (has_more, last_id) {
            (true, Some(id)) => after = Some(id),
            _ => break,
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_and_joins_text_blocks() {
        let resp = json!({
            "content": [
                { "type": "text", "text": "Hello " },
                { "type": "tool_use", "name": "x" },
                { "type": "text", "text": "world" }
            ]
        });
        assert_eq!(extract_text(&resp), "Hello world");
    }

    #[test]
    fn empty_content_is_no_response() {
        assert_eq!(extract_text(&json!({ "content": [] })), "No response");
        assert_eq!(extract_text(&json!({})), "No response");
    }
}
