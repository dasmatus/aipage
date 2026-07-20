//! Client-side tool-calling agent loop over Ollama Cloud's OpenAI-compatible
//! `/v1/chat/completions` endpoint.
//!
//! Replaces the old Anthropic Managed-Agents loop. Ollama is stateless, so the
//! whole loop runs in the sidebar: POST the messages + tools, execute any
//! `tool_calls` the model returns (page scrape / exam read / exam fill / web
//! search), feed the results back as `role:"tool"` messages, and re-POST until
//! the model answers with plain text. All network calls go through the
//! one-shot background CORS proxy — no SSE, no polling.

use serde_json::{json, Value};
use wasm_bindgen::JsValue;

use crate::providers::ollama_cloud::{auth_headers, chat_url, model_of};
use crate::providers::SendOptions;
use crate::proxy::post_json;

/// Cap on tool-call rounds before we give up and return whatever we have.
/// CHOICE: raise for multi-step scan→search→answer flows, lower to bound cost.
const MAX_ITERS: usize = 12;

const AGENT_SYSTEM_PROMPT: &str = "You are AIPage, an agentic study assistant embedded in a sidebar on the EduPage school platform. You help the student understand and answer what is on their screen. Reply in Slovak unless the student writes in another language.\n\nTools available to you:\n- get_page_content: read the visible text of the EduPage page the student is viewing. Call it whenever your answer depends on what is on their screen.\n- get_exam_question: read the current exam question and its answer options.\n- fill_exam_answer: type an answer into the exam field. Only call this when the student explicitly asks you to fill or submit an answer.\n- web_search: search the web for current or factual information.\n\nDecide which tools to use on your own and chain them as needed, then give a clear, step-by-step answer. Don't ask permission for read-only actions (reading the page, searching). Ask before filling an answer unless the student already told you to.";

const WEB_SEARCH_SYSTEM_PROMPT: &str = "You are a web research assistant. Use the web_search tool to look up current or factual information, then synthesize a clear, well-structured answer in the student's language. Cite sources by URL when relevant. If the search returns no useful results, say so plainly.";

/// OpenAI function-tool definitions exposed to the model.
fn openai_tools() -> Value {
    json!([
        { "type": "function", "function": { "name": "get_page_content", "description": "Read the visible text content of the EduPage page the student is currently viewing. Call this whenever answering depends on what is on the page.", "parameters": { "type": "object", "properties": {} } } },
        { "type": "function", "function": { "name": "get_exam_question", "description": "Read the current exam question and its answer options from the page.", "parameters": { "type": "object", "properties": {} } } },
        { "type": "function", "function": { "name": "fill_exam_answer", "description": "Fill an answer into the current exam field on the page. Call only when the student explicitly asks to fill or submit an answer.", "parameters": { "type": "object", "properties": { "value": { "type": "string", "description": "The answer text or option value to fill in." }, "inputType": { "type": "string", "description": "Optional input type, e.g. \"choice\" or \"text\"." } }, "required": ["value"] } } },
        { "type": "function", "function": { "name": "web_search", "description": "Search the web for current or factual information. Returns up to 5 result snippets with titles and URLs.", "parameters": { "type": "object", "properties": { "query": { "type": "string", "description": "The search query." } }, "required": ["query"] } } }
    ])
}

/// Just the web_search tool, for the dedicated search path.
fn web_search_tool() -> Value {
    json!([
        { "type": "function", "function": { "name": "web_search", "description": "Search the web for current or factual information. Returns up to 5 result snippets with titles and URLs.", "parameters": { "type": "object", "properties": { "query": { "type": "string", "description": "The search query." } }, "required": ["query"] } } }
    ])
}

// --- tool execution ---

/// Execute one browser-side / background tool by name. Returns
/// `(result_text, is_error)`. `is_error` is surfaced to the model as the tool
/// result text so it can recover (see the loop).
async fn execute_tool(name: &str, input: &Value) -> (String, bool) {
    match name {
        "get_page_content" => execute_page_content().await,
        "get_exam_question" => execute_exam_question().await,
        "fill_exam_answer" => execute_fill_answer(input).await,
        "web_search" => {
            let query = input.get("query").and_then(Value::as_str).unwrap_or("");
            if query.is_empty() {
                return ("No search query provided.".into(), true);
            }
            run_duckduckgo_search(query).await
        }
        other => (format!("Unknown tool: {other}"), true),
    }
}

async fn execute_page_content() -> (String, bool) {
    let tab_id = match active_tab_id().await {
        Some(id) => id,
        None => return ("No active EduPage tab is open.".into(), true),
    };
    let r = send_to_tab(tab_id, json!({ "action": "get_page_content" })).await;
    match r.get("content").and_then(Value::as_str).filter(|s| !s.is_empty()) {
        Some(c) => (c.to_string(), false),
        None => ("Could not read the page content.".into(), true),
    }
}

async fn execute_exam_question() -> (String, bool) {
    let tab_id = match active_tab_id().await {
        Some(id) => id,
        None => return ("No active EduPage tab is open.".into(), true),
    };
    let r = send_to_tab(tab_id, json!({ "action": "get_exam_question" })).await;
    if r.get("ok").and_then(Value::as_bool).unwrap_or(false) {
        (r.to_string(), false)
    } else {
        ("No exam question found on this page.".into(), true)
    }
}

async fn execute_fill_answer(input: &Value) -> (String, bool) {
    let tab_id = match active_tab_id().await {
        Some(id) => id,
        None => return ("No active EduPage tab is open.".into(), true),
    };
    let value = input.get("value").and_then(Value::as_str).unwrap_or("");
    let input_type = input.get("inputType").and_then(Value::as_str);
    let r = send_to_tab(
        tab_id,
        json!({ "action": "fill_answer", "payload": { "inputType": input_type, "value": value } }),
    )
    .await;
    if r.get("ok").and_then(Value::as_bool).unwrap_or(false) {
        (format!("Filled answer: {value}"), false)
    } else {
        let err = r.get("error").and_then(Value::as_str).unwrap_or("unknown error");
        (format!("Could not fill answer: {err}"), true)
    }
}

/// Run a DuckDuckGo search through the background service worker and format
/// the results for the model. Mirrors the local-provider search path in
/// `state.rs` but returns tool-result text instead of a chat bubble.
async fn run_duckduckgo_search(query: &str) -> (String, bool) {
    use aipage_bindings::runtime;
    let resp = match runtime::send_message(&to_js(&json!({
        "action": "search_web",
        "payload": { "query": query }
    })))
    .await
    {
        Ok(v) => from_js(v),
        Err(_) => Value::Null,
    };
    let results = resp.get("results").and_then(Value::as_array).cloned().unwrap_or_default();
    if results.is_empty() {
        return (format!("No search results found for \"{query}\"."), false);
    }
    let formatted = results
        .iter()
        .enumerate()
        .map(|(i, r)| {
            format!(
                "{}. {}\n   {}\n   URL: {}",
                i + 1,
                r.get("title").and_then(Value::as_str).unwrap_or(""),
                r.get("snippet").and_then(Value::as_str).unwrap_or(""),
                r.get("url").and_then(Value::as_str).unwrap_or("")
            )
        })
        .collect::<Vec<_>>()
        .join("\n\n");
    (formatted, false)
}

async fn active_tab_id() -> Option<i32> {
    let q = to_js(&json!({ "active": true, "lastFocusedWindow": true }));
    let tabs = aipage_bindings::tabs::query(&q).await.ok()?;
    let first = js_sys::Array::from(&tabs).get(0);
    js_sys::Reflect::get(&first, &"id".into()).ok().and_then(|v| v.as_f64()).map(|n| n as i32)
}

async fn send_to_tab(tab_id: i32, msg: Value) -> Value {
    match aipage_bindings::tabs::send_message(tab_id, &to_js(&msg)).await {
        Ok(v) => from_js(v),
        Err(_) => Value::Null,
    }
}

fn to_js(v: &Value) -> JsValue {
    use serde::Serialize;
    v.serialize(&serde_wasm_bindgen::Serializer::json_compatible()).unwrap_or(JsValue::NULL)
}

fn from_js(v: JsValue) -> Value {
    serde_wasm_bindgen::from_value(v).unwrap_or(Value::Null)
}

/// Decode a tool call's `arguments`. OpenAI/Ollama send this as a JSON *string*;
/// be defensive and accept a pre-parsed object too.
fn decode_arguments(raw: &Value) -> Value {
    if let Some(s) = raw.as_str() {
        serde_json::from_str(s).unwrap_or(Value::Null)
    } else {
        raw.clone()
    }
}

// --- the loop ---

/// Run a tool-calling round against Ollama Cloud.
///
/// Executes tool calls until the model returns a plain answer (no `tool_calls`)
/// or [`MAX_ITERS`] is reached. Accumulated assistant text is streamed to
/// `on_text` after each round (joined with `\n\n`, matching the old loop).
async fn run_tool_loop<F>(
    api_key: &str,
    opts: &SendOptions,
    messages: &mut Vec<Value>,
    tools: &Value,
    on_text: &F,
) -> Result<String, String>
where
    F: Fn(String),
{
    let url = chat_url(opts);
    let headers = auth_headers(api_key);
    let model = model_of(opts);
    let mut answer = String::new();

    for _ in 0..MAX_ITERS {
        let body = json!({ "model": model, "messages": messages, "tools": tools, "stream": false });
        let data = post_json(&url, &headers, &body).await?;
        let msg = data.pointer("/choices/0/message").cloned().unwrap_or(Value::Null);

        // CHOICE: accumulate across rounds with a blank-line separator (as the
        // old Anthropic loop did). Replace with `answer = content` to show only
        // the latest round.
        if let Some(content) = msg.get("content").and_then(Value::as_str).filter(|s| !s.is_empty()) {
            if !answer.is_empty() {
                answer.push_str("\n\n");
            }
            answer.push_str(content);
            on_text(answer.clone());
        }

        let tool_calls = msg.get("tool_calls").and_then(Value::as_array).cloned().unwrap_or_default();
        if tool_calls.is_empty() {
            return Ok(answer);
        }

        // Echo the assistant's tool-call message back, then one tool result per call.
        messages.push(msg);
        for tc in &tool_calls {
            let id = tc.get("id").and_then(Value::as_str).unwrap_or("").to_string();
            let name = tc
                .get("function")
                .and_then(|f| f.get("name"))
                .and_then(Value::as_str)
                .unwrap_or("");
            let arguments = tc
                .get("function")
                .and_then(|f| f.get("arguments"))
                .cloned()
                .unwrap_or(Value::Null);
            let input = decode_arguments(&arguments);
            // CHOICE: feed tool errors back to the model as the result text so it
            // can recover. Abort instead (return Err) to be stricter about the
            // fill_exam_answer write tool.
            let (content, _is_error) = execute_tool(name, &input).await;
            messages.push(json!({ "role": "tool", "tool_call_id": id, "content": content }));
        }
    }

    // Hit the iteration cap: return whatever we have rather than failing.
    Ok(answer)
}

/// Run one agentic chat turn for the cloud provider, streaming text via
/// `on_text`. Replaces the Anthropic Managed-Agents `run_agent_turn`.
pub async fn run_agent_turn<F>(
    api_key: &str,
    user_text: &str,
    opts: &SendOptions,
    on_text: F,
) -> Result<(), String>
where
    F: Fn(String),
{
    let mut messages = vec![
        json!({ "role": "system", "content": AGENT_SYSTEM_PROMPT }),
        json!({ "role": "user", "content": user_text }),
    ];
    let tools = openai_tools();
    let answer = run_tool_loop(api_key, opts, &mut messages, &tools, &on_text).await?;
    if answer.is_empty() {
        on_text("(Agent finished without a textual answer.)".to_string());
    }
    Ok(())
}

/// Native web search for Ollama Cloud: a tool-calling round with only the
/// `web_search` tool, returning the model's synthesized answer.
pub async fn web_search(api_key: &str, query: &str, opts: &SendOptions) -> Result<String, String> {
    let mut messages = vec![
        json!({ "role": "system", "content": WEB_SEARCH_SYSTEM_PROMPT }),
        json!({ "role": "user", "content": query }),
    ];
    let tools = web_search_tool();
    let answer = run_tool_loop(api_key, opts, &mut messages, &tools, &|_| {}).await?;
    Ok(answer)
}