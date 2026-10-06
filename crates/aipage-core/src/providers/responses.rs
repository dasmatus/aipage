//! The OpenAI Responses API, used when the ChatGPT / OpenAI provider
//! authenticates with a "Sign in with ChatGPT" access token.
//!
//! OpenAI documents the plan-usage token for exactly two endpoints
//! (`https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference`):
//! `POST https://api.openai.com/v1/responses` with `store: false` and
//! `stream: true`, and `GET https://api.openai.com/v1/models`, both with
//! `Authorization: Bearer <access token>`. The API-key path keeps using
//! `/v1/chat/completions` through [`super::openai_compat`]; this module
//! mirrors its one-shot chat, model listing and function-tool round over the
//! Responses wire format.
//!
//! Streaming is mandatory for plan usage, but the background proxy is
//! one-shot: it reads the whole `text/event-stream` body after the stream
//! ends and hands it back as text, and [`parse_stream`] picks the
//! `response.completed` event out of it. No partial output reaches the UI
//! before the request finishes, as with every other provider.
//!
//! The pure helpers (URL, bodies, SSE parsing, model-list parsing) are
//! unit-tested natively.

use serde_json::{json, Value};

use super::openai_compat::OPENAI;
use super::{ModelInfo, SendOptions};
use crate::proxy::{perform_request, post_json};
use crate::types::SYSTEM_PROMPT;

/// `<base>/v1/responses` for the configured (or default) base URL.
pub fn responses_url(opts: &SendOptions) -> String {
    format!("{}/v1/responses", OPENAI.base_url(opts))
}

/// `<base>/v1/models`.
pub fn models_url(opts: &SendOptions) -> String {
    OPENAI.models_url(opts)
}

/// A Responses request: `instructions` is the system prompt, `input` the
/// conversation items. `store: false` + `stream: true` are what plan usage
/// requires.
pub fn request_body(model: &str, instructions: &str, input: &[Value], tools: Option<&Value>) -> Value {
    let mut body = json!({
        "model": model,
        "instructions": instructions,
        "input": input,
        "store": false,
        "stream": true,
    });
    if let Some(t) = tools {
        body["tools"] = t.clone();
    }
    body
}

/// Convert Chat Completions function tools
/// (`{ type: "function", function: { name, description, parameters } }`) to
/// the flat Responses shape (`{ type: "function", name, description,
/// parameters }`).
pub fn tools_from_openai(tools: &Value) -> Value {
    let flat: Vec<Value> = tools
        .as_array()
        .map(|arr| {
            arr.iter()
                .filter_map(|t| {
                    let f = t.get("function")?;
                    let mut out = json!({ "type": "function", "name": f.get("name")?.as_str()? });
                    if let Some(d) = f.get("description") {
                        out["description"] = d.clone();
                    }
                    if let Some(p) = f.get("parameters") {
                        out["parameters"] = p.clone();
                    }
                    Some(out)
                })
                .collect()
        })
        .unwrap_or_default();
    Value::Array(flat)
}

/// A `function_call` output item.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct FunctionCall {
    pub call_id: String,
    pub name: String,
    pub arguments: String,
}

/// The `function_call` items of a response's `output`, in order.
pub fn function_calls(resp: &Value) -> Vec<FunctionCall> {
    output_items(resp)
        .iter()
        .filter(|item| item.get("type").and_then(Value::as_str) == Some("function_call"))
        .filter_map(|item| {
            Some(FunctionCall {
                call_id: item.get("call_id")?.as_str()?.to_string(),
                name: item.get("name")?.as_str()?.to_string(),
                arguments: item.get("arguments").and_then(Value::as_str).unwrap_or("{}").to_string(),
            })
        })
        .collect()
}

/// The response's `output` array (empty when absent).
pub fn output_items(resp: &Value) -> Vec<Value> {
    resp.get("output").and_then(Value::as_array).cloned().unwrap_or_default()
}

/// The concatenated `output_text` of every assistant message in `output`
/// (the `output_text` convenience field is not part of the wire format).
pub fn output_text(resp: &Value) -> String {
    let mut text = String::new();
    for item in output_items(resp) {
        if item.get("type").and_then(Value::as_str) != Some("message") {
            continue;
        }
        for part in item.get("content").and_then(Value::as_array).into_iter().flatten() {
            if part.get("type").and_then(Value::as_str) == Some("output_text") {
                if let Some(t) = part.get("text").and_then(Value::as_str) {
                    text.push_str(t);
                }
            }
        }
    }
    text
}

/// A `function_call_output` input item answering `call_id`.
pub fn function_call_output(call_id: &str, output: &str) -> Value {
    json!({ "type": "function_call_output", "call_id": call_id, "output": output })
}

/// The final response object out of what the proxy returned: the
/// `response.completed` (or `response.incomplete`) event of an SSE body, or
/// a plain JSON response object when the server did not stream. A
/// `response.failed` / `error` event is an `Err` with the server's message.
pub fn parse_stream(data: &Value) -> Result<Value, String> {
    match data {
        Value::String(text) => parse_sse(text),
        Value::Object(_) => match data.get("object").and_then(Value::as_str) {
            Some("response") => Ok(data.clone()),
            _ => data
                .get("response")
                .cloned()
                .ok_or_else(|| "unexpected Responses API reply".to_string()),
        },
        _ => Err("empty reply from the Responses API".into()),
    }
}

fn parse_sse(text: &str) -> Result<Value, String> {
    let mut last_error: Option<String> = None;
    let mut completed: Option<Value> = None;
    let mut data_lines: Vec<&str> = Vec::new();
    let mut handle = |data_lines: &mut Vec<&str>| {
        if data_lines.is_empty() {
            return;
        }
        let joined = data_lines.join("\n");
        data_lines.clear();
        let Ok(ev) = serde_json::from_str::<Value>(&joined) else { return };
        match ev.get("type").and_then(Value::as_str) {
            Some("response.completed") | Some("response.incomplete") => {
                if let Some(r) = ev.get("response") {
                    completed = Some(r.clone());
                }
            }
            Some("response.failed") => {
                let msg = ev
                    .pointer("/response/error/message")
                    .and_then(Value::as_str)
                    .unwrap_or("the response failed")
                    .to_string();
                last_error = Some(msg);
            }
            Some("error") => {
                let msg = ev.get("message").and_then(Value::as_str).unwrap_or("Responses API error").to_string();
                last_error = Some(match ev.get("code").and_then(Value::as_str) {
                    Some(code) => format!("{msg} ({code})"),
                    None => msg,
                });
            }
            _ => {}
        }
    };
    for raw_line in text.split('\n') {
        let line = raw_line.strip_suffix('\r').unwrap_or(raw_line);
        if line.is_empty() {
            handle(&mut data_lines);
        } else if let Some(d) = line.strip_prefix("data:") {
            data_lines.push(d.strip_prefix(' ').unwrap_or(d));
        }
        // `event:`, `id:` and comment lines carry nothing we need.
    }
    handle(&mut data_lines);
    match (completed, last_error) {
        (Some(r), _) => Ok(r),
        (None, Some(e)) => Err(e),
        (None, None) => Err("the Responses API stream ended without a completed response".into()),
    }
}

/// Model ids from `GET /v1/models`: the public-API shape
/// (`{ data: [{ id }] }`) or the plan-usage shape (`{ models: [{ slug,
/// display_name, visibility }] }`, keeping `visibility: "list"` entries).
pub fn parse_models(data: &Value) -> Vec<String> {
    if let Some(models) = data.get("models").and_then(Value::as_array) {
        return models
            .iter()
            .filter(|m| m.get("visibility").and_then(Value::as_str).is_none_or(|v| v == "list"))
            .filter_map(|m| m.get("slug").or_else(|| m.get("id")).and_then(Value::as_str))
            .map(str::to_string)
            .collect();
    }
    super::openai_compat::parse_model_ids(data)
}

/// POST a Responses request and return the completed response object.
pub async fn post(token: &str, opts: &SendOptions, body: &Value) -> Result<Value, String> {
    let data = post_json(&responses_url(opts), &OPENAI.headers(token), body).await?;
    parse_stream(&data)
}

/// One-shot: `instructions` + a single user message, the answer text.
pub async fn complete(instructions: &str, user: &str, token: &str, opts: &SendOptions) -> Result<String, String> {
    let input = [json!({ "role": "user", "content": user })];
    let body = request_body(&OPENAI.model_of(opts), instructions, &input, None);
    let resp = post(token, opts, &body).await?;
    let text = output_text(&resp);
    Ok(if text.is_empty() { "No response".to_string() } else { text })
}

/// The default system prompt + the user's message.
pub async fn send_message(prompt: &str, token: &str, opts: &SendOptions) -> Result<String, String> {
    complete(SYSTEM_PROMPT, prompt, token, opts).await
}

/// `GET /v1/models` with the access token (empty on error).
pub async fn get_models(token: &str, opts: &SendOptions) -> Vec<ModelInfo> {
    match perform_request(&models_url(opts), "GET", &OPENAI.headers(token), None).await {
        Ok(data) => {
            let mut ids = parse_models(&data);
            ids.sort();
            ids.into_iter().map(|id| ModelInfo { id, provider: OPENAI.label.to_string() }).collect()
        }
        Err(e) => {
            aipage_bindings::console::error(format!("Failed to fetch ChatGPT models: {e}"));
            Vec::new()
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn urls_follow_the_openai_base() {
        assert_eq!(responses_url(&SendOptions::default()), "https://api.openai.com/v1/responses");
        assert_eq!(models_url(&SendOptions::default()), "https://api.openai.com/v1/models");
        let custom = SendOptions { base_url: Some("https://proxy.example/v1/".into()), ..SendOptions::default() };
        assert_eq!(responses_url(&custom), "https://proxy.example/v1/responses");
    }

    #[test]
    fn request_body_has_plan_usage_flags() {
        let input = [json!({ "role": "user", "content": "hi" })];
        let b = request_body("gpt-6.1-sol", "sys", &input, None);
        assert_eq!(b["model"], "gpt-6.1-sol");
        assert_eq!(b["instructions"], "sys");
        assert_eq!(b["input"], json!(input));
        assert_eq!(b["store"], false);
        assert_eq!(b["stream"], true);
        assert!(b.get("tools").is_none());
        let with_tools = request_body("m", "s", &input, Some(&json!([{ "type": "function", "name": "t" }])));
        assert_eq!(with_tools["tools"][0]["name"], "t");
    }

    #[test]
    fn tools_are_flattened() {
        let chat_tools = json!([
            { "type": "function", "function": { "name": "web_search", "description": "d", "parameters": { "type": "object", "properties": { "query": { "type": "string" } }, "required": ["query"] } } },
            { "type": "function", "function": { "name": "get_page_content", "parameters": { "type": "object", "properties": {} } } },
            { "type": "other" }
        ]);
        let t = tools_from_openai(&chat_tools);
        assert_eq!(t.as_array().unwrap().len(), 2);
        assert_eq!(t[0], json!({ "type": "function", "name": "web_search", "description": "d", "parameters": { "type": "object", "properties": { "query": { "type": "string" } }, "required": ["query"] } }));
        assert_eq!(t[1]["name"], "get_page_content");
        assert!(t[1].get("description").is_none());
        assert_eq!(tools_from_openai(&json!(null)), json!([]));
    }

    fn completed(output: Value) -> String {
        format!(
            "event: response.created\ndata: {{\"type\":\"response.created\",\"response\":{{\"id\":\"r1\",\"output\":[]}}}}\n\nevent: response.output_text.delta\ndata: {{\"type\":\"response.output_text.delta\",\"delta\":\"He\"}}\n\nevent: response.completed\ndata: {{\"type\":\"response.completed\",\"response\":{{\"id\":\"r1\",\"object\":\"response\",\"status\":\"completed\",\"output\":{output}}}}}\n\n"
        )
    }

    #[test]
    fn sse_stream_yields_the_completed_response() {
        let sse = completed(json!([
            { "type": "reasoning", "id": "rs1", "summary": [] },
            { "type": "message", "id": "m1", "role": "assistant", "content": [ { "type": "output_text", "text": "Hello, " }, { "type": "output_text", "text": "world!" } ] }
        ]));
        let resp = parse_stream(&Value::String(sse)).unwrap();
        assert_eq!(resp["id"], "r1");
        assert_eq!(output_text(&resp), "Hello, world!");
        assert!(function_calls(&resp).is_empty());
        assert_eq!(output_items(&resp).len(), 2);
    }

    #[test]
    fn sse_stream_with_crlf_and_multiline_data() {
        let sse = "data: {\"type\":\"response.completed\",\r\ndata: \"response\":{\"output\":[{\"type\":\"message\",\"content\":[{\"type\":\"output_text\",\"text\":\"ok\"}]}]}}\r\n\r\n";
        let resp = parse_stream(&Value::String(sse.into())).unwrap();
        assert_eq!(output_text(&resp), "ok");
        // No trailing blank line.
        let tail = "data: {\"type\":\"response.completed\",\"response\":{\"output\":[]}}";
        assert_eq!(output_text(&parse_stream(&Value::String(tail.into())).unwrap()), "");
    }

    #[test]
    fn sse_failures_are_errors() {
        let failed = "event: response.failed\ndata: {\"type\":\"response.failed\",\"response\":{\"status\":\"failed\",\"error\":{\"code\":\"subscription_sharing_usage_limit_exceeded\",\"message\":\"Usage limit reached\"}}}\n\n";
        assert_eq!(parse_stream(&Value::String(failed.into())), Err("Usage limit reached".into()));
        let err = "event: error\ndata: {\"type\":\"error\",\"code\":\"rate_limit\",\"message\":\"Slow down\"}\n\n";
        assert_eq!(parse_stream(&Value::String(err.into())), Err("Slow down (rate_limit)".into()));
        assert!(parse_stream(&Value::String("event: response.created\ndata: {}\n\n".into())).is_err());
        assert!(parse_stream(&Value::Null).is_err());
        // An incomplete response still carries its partial output.
        let inc = "data: {\"type\":\"response.incomplete\",\"response\":{\"status\":\"incomplete\",\"output\":[{\"type\":\"message\",\"content\":[{\"type\":\"output_text\",\"text\":\"part\"}]}]}}\n\n";
        assert_eq!(output_text(&parse_stream(&Value::String(inc.into())).unwrap()), "part");
    }

    #[test]
    fn non_streamed_json_is_accepted() {
        let obj = json!({ "object": "response", "output": [ { "type": "message", "content": [ { "type": "output_text", "text": "plain" } ] } ] });
        assert_eq!(output_text(&parse_stream(&obj).unwrap()), "plain");
        let wrapped = json!({ "response": { "output": [] } });
        assert_eq!(parse_stream(&wrapped).unwrap(), json!({ "output": [] }));
        assert!(parse_stream(&json!({ "foo": 1 })).is_err());
    }

    #[test]
    fn function_calls_are_extracted_and_answered() {
        let resp = json!({ "output": [
            { "type": "function_call", "id": "fc1", "call_id": "call_1", "name": "web_search", "arguments": "{\"query\":\"x\"}" },
            { "type": "function_call", "id": "fc2", "call_id": "call_2", "name": "get_page_content" },
            { "type": "message", "content": [] },
            { "type": "function_call", "name": "no-call-id" }
        ] });
        let calls = function_calls(&resp);
        assert_eq!(calls, vec![
            FunctionCall { call_id: "call_1".into(), name: "web_search".into(), arguments: "{\"query\":\"x\"}".into() },
            FunctionCall { call_id: "call_2".into(), name: "get_page_content".into(), arguments: "{}".into() },
        ]);
        assert_eq!(function_call_output("call_1", "result"), json!({ "type": "function_call_output", "call_id": "call_1", "output": "result" }));
    }

    #[test]
    fn model_lists_in_both_shapes() {
        let plan = json!({ "models": [
            { "slug": "gpt-6.1-sol", "display_name": "GPT-6.1", "visibility": "list" },
            { "slug": "gpt-hidden", "visibility": "hidden" },
            { "slug": "gpt-5", "display_name": "GPT-5" },
            { "display_name": "no slug" }
        ] });
        assert_eq!(parse_models(&plan), vec!["gpt-6.1-sol", "gpt-5"]);
        let public = json!({ "data": [ { "id": "gpt-4.1-mini" }, { "id": "gpt-4o" } ] });
        assert_eq!(parse_models(&public), vec!["gpt-4.1-mini", "gpt-4o"]);
        assert!(parse_models(&json!({})).is_empty());
    }
}
