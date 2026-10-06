//! Claude provider over the Anthropic Messages API (`POST /v1/messages`),
//! routed through the background CORS proxy.
//!
//! Unlike the OpenAI-compatible providers this module owns its wire format:
//! `x-api-key` + `anthropic-version` headers, a top-level `system` string, a
//! response `content` array of typed blocks, and Anthropic-shaped tools
//! (`input_schema`; `tool_use` blocks answered by `tool_result` blocks in a
//! `user` turn). The agentic loop for that format lives in [`crate::agent`];
//! native web search uses Claude's server-side `web_search` tool, resumed
//! while the API reports `stop_reason == "pause_turn"`.
//!
//! Nothing here that does not touch the network depends on wasm, and every
//! such helper is `pub` and exercised natively in `tests/anthropic.rs`.
//!
//! Storage keys (`anthropic_api_key`, `anthropic_base_url`, `anthropic_model`)
//! are the ones the pre-Ollama builds used, so a returning user's saved key is
//! picked up again.

use std::collections::HashMap;

use serde_json::{json, Value};

use super::openai_compat::parse_model_ids;
use super::{ModelInfo, SendOptions};
use crate::proxy::{perform_request, post_json};
use crate::types::SYSTEM_PROMPT;

/// Display label used next to model ids in the picker and in logs.
pub const LABEL: &str = "Claude (Anthropic)";
/// `/v1/messages` and `/v1/models` are appended to this, so no `/v1` suffix.
pub const DEFAULT_BASE_URL: &str = "https://api.anthropic.com";
/// Claude Opus 5.5, the current Opus and the Claude API reference's default.
pub const DEFAULT_MODEL: &str = "claude-opus-5-5";
/// The Messages API version header every request carries.
pub const API_VERSION: &str = "2023-06-01";
/// Output cap for the one-shot (non-streaming) requests the proxy supports.
pub const MAX_TOKENS: u32 = 16_000;
/// How many times a server-side tool turn is resumed after `pause_turn`.
pub const MAX_PAUSE_RESUMES: usize = 5;
const MODELS_PAGE_SIZE: u32 = 100;

/// Normalise a user-entered base URL: empty → [`DEFAULT_BASE_URL`], and a
/// trailing `/` or `/v1` stripped so callers can append `/v1/...`.
pub fn normalize_base_url(raw: &str) -> String {
    let raw = raw.trim();
    let mut base = if raw.is_empty() { DEFAULT_BASE_URL.to_string() } else { raw.to_string() };
    if let Some(stripped) = base.strip_suffix('/') {
        base = stripped.to_string();
    }
    if let Some(stripped) = base.strip_suffix("/v1") {
        base = stripped.to_string();
    }
    base
}

fn base_url(opts: &SendOptions) -> String {
    normalize_base_url(opts.base_url.as_deref().unwrap_or(""))
}

pub fn messages_url(opts: &SendOptions) -> String {
    format!("{}/v1/messages", base_url(opts))
}

/// `GET /v1/models` URL for one page; `after` is the previous page's `last_id`.
pub fn models_url(opts: &SendOptions, after: Option<&str>) -> String {
    let base = format!("{}/v1/models?limit={MODELS_PAGE_SIZE}", base_url(opts));
    match after {
        Some(id) => format!("{base}&after_id={id}"),
        None => base,
    }
}

/// The model to request: the user's choice, else [`DEFAULT_MODEL`].
pub fn model_of(opts: &SendOptions) -> String {
    opts.model_name
        .as_deref()
        .filter(|s| !s.is_empty())
        .unwrap_or(DEFAULT_MODEL)
        .to_string()
}

/// `content-type`, `x-api-key` and `anthropic-version`. Claude authenticates
/// with the key header, not a Bearer token.
pub fn headers(api_key: &str) -> HashMap<String, String> {
    let mut h = HashMap::new();
    h.insert("content-type".to_string(), "application/json".to_string());
    h.insert("x-api-key".to_string(), api_key.to_string());
    h.insert("anthropic-version".to_string(), API_VERSION.to_string());
    h
}

/// A Messages API request body. `messages` is the alternating user /
/// assistant history; `tools` is appended only when given.
pub fn message_body(model: &str, system: &str, messages: &[Value], tools: Option<&Value>) -> Value {
    let mut body = json!({
        "model": model,
        "max_tokens": MAX_TOKENS,
        "system": system,
        "messages": messages,
    });
    if let Some(tools) = tools {
        body["tools"] = tools.clone();
    }
    body
}

/// The response's `stop_reason`, if any.
pub fn stop_reason(resp: &Value) -> Option<&str> {
    resp.get("stop_reason").and_then(Value::as_str)
}

/// The concatenated `text` blocks of a response (empty when there are none).
/// Thinking, tool-use and server-tool blocks are skipped.
pub fn text_blocks(resp: &Value) -> String {
    resp.get("content")
        .and_then(Value::as_array)
        .map(|blocks| {
            blocks
                .iter()
                .filter(|b| b.get("type").and_then(Value::as_str) == Some("text"))
                .filter_map(|b| b.get("text").and_then(Value::as_str))
                .collect::<String>()
        })
        .unwrap_or_default()
}

/// [`text_blocks`], defaulting to "No response" when empty (the contract the
/// chat view expects from every provider).
pub fn extract_text(resp: &Value) -> String {
    let text = text_blocks(resp);
    if text.is_empty() {
        "No response".to_string()
    } else {
        text
    }
}

/// A user-facing message when the model declined the request
/// (`stop_reason == "refusal"`, HTTP 200). `stop_details` is informational
/// and may be absent.
pub fn refusal_message(resp: &Value) -> Option<String> {
    if stop_reason(resp) != Some("refusal") {
        return None;
    }
    let mut msg = String::from("Claude declined this request");
    if let Some(category) = resp.pointer("/stop_details/category").and_then(Value::as_str) {
        msg.push_str(&format!(" ({category})"));
    }
    if let Some(explanation) = resp.pointer("/stop_details/explanation").and_then(Value::as_str) {
        msg.push_str(&format!(": {explanation}"));
    } else {
        msg.push('.');
    }
    Some(msg)
}

/// One client-tool call the model asked for.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ToolUse {
    pub id: String,
    pub name: String,
    pub input: Value,
}

/// Every `tool_use` block in a response, in order. Server-side tool blocks
/// (`server_tool_use`, `web_search_tool_result`) are not included: the API
/// runs those itself.
pub fn parse_tool_uses(resp: &Value) -> Vec<ToolUse> {
    resp.get("content")
        .and_then(Value::as_array)
        .map(|blocks| {
            blocks
                .iter()
                .filter(|b| b.get("type").and_then(Value::as_str) == Some("tool_use"))
                .map(|b| ToolUse {
                    id: b.get("id").and_then(Value::as_str).unwrap_or_default().to_string(),
                    name: b.get("name").and_then(Value::as_str).unwrap_or_default().to_string(),
                    input: b.get("input").cloned().unwrap_or_else(|| json!({})),
                })
                .collect()
        })
        .unwrap_or_default()
}

/// The assistant turn to echo back before continuing: the response's full
/// `content` array (thinking and tool-use blocks included, as the API
/// requires), or an empty array when the response had none.
pub fn assistant_turn(resp: &Value) -> Value {
    let content = resp.get("content").cloned().unwrap_or_else(|| json!([]));
    json!({ "role": "assistant", "content": content })
}

/// A `tool_result` block for a client tool call. `is_error` is only written
/// when true.
pub fn tool_result_block(tool_use_id: &str, content: &str, is_error: bool) -> Value {
    let mut block = json!({ "type": "tool_result", "tool_use_id": tool_use_id, "content": content });
    if is_error {
        block["is_error"] = Value::Bool(true);
    }
    block
}

/// Convert OpenAI function-tool definitions (`{"type":"function","function":
/// {name, description, parameters}}`) to Anthropic custom tools
/// (`{name, description, input_schema}`), so both loops share one set of
/// tool names, descriptions and schemas. Entries that are not function
/// tools are dropped.
pub fn tools_from_openai(tools: &Value) -> Value {
    let converted: Vec<Value> = tools
        .as_array()
        .map(|arr| {
            arr.iter()
                .filter(|t| t.get("type").and_then(Value::as_str) == Some("function"))
                .filter_map(|t| t.get("function"))
                .filter_map(|f| {
                    let name = f.get("name").and_then(Value::as_str)?;
                    Some(json!({
                        "name": name,
                        "description": f.get("description").and_then(Value::as_str).unwrap_or_default(),
                        "input_schema": f.get("parameters").cloned().unwrap_or_else(|| json!({ "type": "object", "properties": {} })),
                    }))
                })
                .collect()
        })
        .unwrap_or_default();
    Value::Array(converted)
}

/// Whether the model takes the `web_search_20260209` tool variant (built-in
/// dynamic filtering) rather than the basic `web_search_20250305`. Per the
/// Claude API reference the newer variant covers Opus 4.6 and later, Sonnet
/// 4.6 and later and the 5.x families; Haiku and the pre-4.6 models keep the
/// basic one. Unknown ids (aliases, gateways) get the newer variant.
pub fn supports_dynamic_filtering(model: &str) -> bool {
    let m = model.to_ascii_lowercase();
    if m.contains("haiku") || m.contains("claude-3") || m.contains("claude-2") {
        return false;
    }
    // The 4.x family splits at 4.6: `claude-opus-4-5-20251101` → "5" → basic.
    // A long digit run right after `-4-` is a date on a 4.0 id → basic.
    match m.find("-4-") {
        Some(idx) => {
            let digits: String = m[idx + 3..].chars().take_while(char::is_ascii_digit).collect();
            matches!(digits.parse::<u8>(), Ok(minor) if digits.len() == 1 && minor >= 6)
        }
        None => true,
    }
}

/// The server-side web search tool definition for a model.
pub fn web_search_tool(model: &str) -> Value {
    let kind = if supports_dynamic_filtering(model) { "web_search_20260209" } else { "web_search_20250305" };
    json!({ "type": kind, "name": "web_search" })
}

/// The `after_id` for the next `/v1/models` page, when `has_more` is set.
pub fn next_page_cursor(resp: &Value) -> Option<String> {
    let has_more = resp.get("has_more").and_then(Value::as_bool).unwrap_or(false);
    let last_id = resp.get("last_id").and_then(Value::as_str)?;
    (has_more && !last_id.is_empty()).then(|| last_id.to_string())
}

/// Map one `/v1/models` page to [`ModelInfo`]s (`data[].id`).
pub fn models_from(resp: &Value) -> Vec<ModelInfo> {
    parse_model_ids(resp)
        .into_iter()
        .map(|id| ModelInfo { id, provider: LABEL.to_string() })
        .collect()
}

/// POST a Messages API body and surface a refusal as an error.
pub(crate) async fn post_messages(
    api_key: &str,
    opts: &SendOptions,
    body: &Value,
) -> Result<Value, String> {
    let resp = post_json(&messages_url(opts), &headers(api_key), body).await?;
    match refusal_message(&resp) {
        Some(msg) => Err(msg),
        None => Ok(resp),
    }
}

/// One-shot chat: the project system prompt plus the user prompt, no tools.
pub async fn send_message(prompt: &str, api_key: &str, opts: &SendOptions) -> Result<String, String> {
    let messages = [json!({ "role": "user", "content": prompt })];
    let body = message_body(&model_of(opts), SYSTEM_PROMPT, &messages, None);
    let resp = post_messages(api_key, opts, &body).await?;
    Ok(extract_text(&resp))
}

/// Native web search via Claude's server-side `web_search` tool. The API runs
/// the search loop itself; when it pauses (`stop_reason == "pause_turn"`) the
/// assistant turn is echoed back unchanged and the request re-sent, up to
/// [`MAX_PAUSE_RESUMES`] times.
pub async fn web_search(query: &str, api_key: &str, opts: &SendOptions) -> Result<String, String> {
    let model = model_of(opts);
    let tools = json!([web_search_tool(&model)]);
    let mut messages = vec![json!({ "role": "user", "content": query })];

    let mut resp = post_messages(
        api_key,
        opts,
        &message_body(&model, crate::agent::WEB_SEARCH_SYSTEM_PROMPT, &messages, Some(&tools)),
    )
    .await?;
    for _ in 0..MAX_PAUSE_RESUMES {
        if stop_reason(&resp) != Some("pause_turn") {
            break;
        }
        messages.push(assistant_turn(&resp));
        resp = post_messages(
            api_key,
            opts,
            &message_body(&model, crate::agent::WEB_SEARCH_SYSTEM_PROMPT, &messages, Some(&tools)),
        )
        .await?;
    }
    Ok(extract_text(&resp))
}

/// `GET /v1/models`, following `has_more` / `last_id` pagination. Empty when
/// there is no key or on error (matching the other providers).
pub async fn get_models(api_key: &str, opts: &SendOptions) -> Vec<ModelInfo> {
    if api_key.is_empty() {
        return Vec::new();
    }
    let h = headers(api_key);
    let mut out = Vec::new();
    let mut after: Option<String> = None;
    loop {
        let url = models_url(opts, after.as_deref());
        let resp = match perform_request(&url, "GET", &h, None).await {
            Ok(v) => v,
            Err(e) => {
                aipage_bindings::console::error(format!("Failed to fetch {LABEL} models: {e}"));
                break;
            }
        };
        out.extend(models_from(&resp));
        match next_page_cursor(&resp) {
            Some(cursor) => after = Some(cursor),
            None => break,
        }
    }
    out
}
