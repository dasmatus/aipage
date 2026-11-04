//! The OpenAI Responses API wire format (`POST /v1/responses`), for gateways
//! that serve some models only over it (OpenCode Go's `gpt-*` models, see
//! [`super::opencode_go`]).
//!
//! Requests carry `instructions` (the system prompt), an `input` item list
//! and flat function tools (`{type, name, description, parameters}`), with
//! `store: false` so nothing is kept server-side. The answer is an `output`
//! item list: `message` items hold `output_text` parts, `function_call`
//! items (`call_id`, `name`, JSON-string `arguments`) ask for a tool, and
//! are answered by `function_call_output` input items. The tool loop lives
//! in [`crate::agent`]; everything here is pure and tested natively.

use std::collections::HashMap;

use serde_json::{json, Value};

use crate::proxy::post_json;

/// Where a Responses API request goes.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Endpoint {
    pub url: String,
    pub headers: HashMap<String, String>,
    pub model: String,
}

impl Endpoint {
    pub(crate) async fn post(&self, body: &Value) -> Result<Value, String> {
        post_json(&self.url, &self.headers, body).await
    }

    /// One-shot request: `instructions` + one user message, no tools; the
    /// answer text ("No response" when empty).
    pub(crate) async fn complete(&self, instructions: &str, user: &str) -> Result<String, String> {
        let input = [user_message(user)];
        let resp = self.post(&request_body(&self.model, instructions, &input, None)).await?;
        let text = output_text(&resp);
        Ok(if text.is_empty() { "No response".to_string() } else { text })
    }
}

/// A user message input item.
pub fn user_message(text: &str) -> Value {
    json!({ "role": "user", "content": text })
}

/// A request body; `tools` is added only when given.
pub fn request_body(model: &str, instructions: &str, input: &[Value], tools: Option<&Value>) -> Value {
    let mut body = json!({
        "model": model,
        "instructions": instructions,
        "input": input,
        "store": false,
    });
    if let Some(tools) = tools {
        body["tools"] = tools.clone();
    }
    body
}

/// Convert OpenAI chat-completions function tools (`{type:"function",
/// function:{name, description, parameters}}`) to Responses function tools
/// (`{type:"function", name, description, parameters}`). Entries that are not
/// function tools are dropped.
pub fn tools_from_chat(tools: &Value) -> Value {
    let converted: Vec<Value> = tools
        .as_array()
        .map(|arr| {
            arr.iter()
                .filter(|t| t.get("type").and_then(Value::as_str) == Some("function"))
                .filter_map(|t| t.get("function"))
                .filter_map(|f| {
                    let name = f.get("name").and_then(Value::as_str)?;
                    Some(json!({
                        "type": "function",
                        "name": name,
                        "description": f.get("description").and_then(Value::as_str).unwrap_or_default(),
                        "parameters": f.get("parameters").cloned().unwrap_or_else(|| json!({ "type": "object", "properties": {} })),
                    }))
                })
                .collect()
        })
        .unwrap_or_default();
    Value::Array(converted)
}

fn output_items(resp: &Value) -> &[Value] {
    resp.get("output").and_then(Value::as_array).map(Vec::as_slice).unwrap_or(&[])
}

fn item_type(item: &Value) -> Option<&str> {
    item.get("type").and_then(Value::as_str)
}

/// The text of one `message` item's `output_text` parts.
fn message_text(item: &Value) -> String {
    item.get("content")
        .and_then(Value::as_array)
        .map(|parts| {
            parts
                .iter()
                .filter(|p| item_type(p) == Some("output_text"))
                .filter_map(|p| p.get("text").and_then(Value::as_str))
                .collect::<String>()
        })
        .unwrap_or_default()
}

/// The concatenated `output_text` of every `message` item (empty when none).
pub fn output_text(resp: &Value) -> String {
    output_items(resp)
        .iter()
        .filter(|i| item_type(i) == Some("message"))
        .map(message_text)
        .collect()
}

/// One function call the model asked for.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct FunctionCall {
    pub call_id: String,
    pub name: String,
    /// The raw `arguments` (a JSON string).
    pub arguments: Value,
}

/// Every `function_call` item of a response, in order.
pub fn function_calls(resp: &Value) -> Vec<FunctionCall> {
    output_items(resp)
        .iter()
        .filter(|i| item_type(i) == Some("function_call"))
        .map(|i| FunctionCall {
            call_id: i.get("call_id").and_then(Value::as_str).unwrap_or_default().to_string(),
            name: i.get("name").and_then(Value::as_str).unwrap_or_default().to_string(),
            arguments: i.get("arguments").cloned().unwrap_or(Value::Null),
        })
        .collect()
}

/// The input items that replay a response's turn on the next request.
/// With `store: false` nothing can be referenced by id, so messages become
/// plain assistant messages and function calls are copied without their
/// item `id`; reasoning items are dropped (they would need encrypted content).
pub fn replay_items(resp: &Value) -> Vec<Value> {
    output_items(resp)
        .iter()
        .filter_map(|i| match item_type(i) {
            Some("message") => {
                let text = message_text(i);
                (!text.is_empty()).then(|| json!({ "role": "assistant", "content": text }))
            }
            Some("function_call") => Some(json!({
                "type": "function_call",
                "call_id": i.get("call_id").cloned().unwrap_or(Value::Null),
                "name": i.get("name").cloned().unwrap_or(Value::Null),
                "arguments": i.get("arguments").cloned().unwrap_or_else(|| json!("{}")),
            })),
            _ => None,
        })
        .collect()
}

/// The input item answering a function call.
pub fn function_call_output(call_id: &str, output: &str) -> Value {
    json!({ "type": "function_call_output", "call_id": call_id, "output": output })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample() -> Value {
        json!({ "output": [
            { "type": "reasoning", "id": "rs_1", "summary": [] },
            { "type": "message", "id": "msg_1", "role": "assistant", "content": [
                { "type": "output_text", "text": "Let me " },
                { "type": "output_text", "text": "check." }
            ] },
            { "type": "function_call", "id": "fc_1", "call_id": "call_a", "name": "web_search", "arguments": "{\"query\":\"x\"}" }
        ] })
    }

    #[test]
    fn body_has_instructions_input_and_no_store() {
        let body = request_body("gpt-6-luna", "sys", &[user_message("hi")], None);
        assert_eq!(body["model"], "gpt-6-luna");
        assert_eq!(body["instructions"], "sys");
        assert_eq!(body["input"], json!([{ "role": "user", "content": "hi" }]));
        assert_eq!(body["store"], false);
        assert!(body.get("tools").is_none());
        let tools = json!([]);
        assert_eq!(request_body("m", "s", &[], Some(&tools))["tools"], json!([]));
    }

    #[test]
    fn chat_tools_are_flattened() {
        let chat = json!([
            { "type": "function", "function": { "name": "web_search", "description": "d", "parameters": { "type": "object" } } },
            { "type": "web_search_20250305", "name": "server" }
        ]);
        assert_eq!(
            tools_from_chat(&chat),
            json!([{ "type": "function", "name": "web_search", "description": "d", "parameters": { "type": "object" } }])
        );
    }

    #[test]
    fn parses_text_and_function_calls() {
        let resp = sample();
        assert_eq!(output_text(&resp), "Let me check.");
        assert_eq!(
            function_calls(&resp),
            vec![FunctionCall { call_id: "call_a".into(), name: "web_search".into(), arguments: json!("{\"query\":\"x\"}") }]
        );
        assert_eq!(output_text(&json!({})), "");
        assert!(function_calls(&json!({ "output": "bogus" })).is_empty());
    }

    #[test]
    fn replay_drops_ids_and_reasoning() {
        assert_eq!(
            replay_items(&sample()),
            vec![
                json!({ "role": "assistant", "content": "Let me check." }),
                json!({ "type": "function_call", "call_id": "call_a", "name": "web_search", "arguments": "{\"query\":\"x\"}" }),
            ]
        );
        assert_eq!(
            function_call_output("call_a", "result"),
            json!({ "type": "function_call_output", "call_id": "call_a", "output": "result" })
        );
    }
}
