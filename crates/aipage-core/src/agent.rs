//! Client-side tool-calling agent loops.
//!
//! The backends are stateless, so the whole loop runs in the sidebar: POST
//! the messages + tools, execute the tool calls the model returns (page
//! scrape / exam read / exam fill / web search), feed the results back, and
//! re-POST until the model answers with plain text. All network calls go
//! through the one-shot background CORS proxy — no SSE, no polling.
//!
//! Two wire formats share one set of tool names, descriptions, schemas and
//! executors:
//! * the OpenAI-compatible `/v1/chat/completions` loop, generic over
//!   [`OpenAiCompat`] (Ollama Cloud, OpenRouter, ...): `tool_calls` answered
//!   by `role:"tool"` messages;
//! * the Anthropic Messages API loop for Claude: `tool_use` content blocks
//!   answered by `tool_result` blocks in one `user` turn, plus Claude's
//!   server-side `web_search` tool in place of the DuckDuckGo one, and
//!   `pause_turn` resumption.
//!
//! [`run_agent_turn`] and [`web_search`] dispatch on [`ProviderType`]; any
//! provider whose [`ProviderType::supports_native_tools`] is true lands in one
//! of the two.

use serde_json::{json, Value};

use aipage_bindings::{from_js, runtime, tabs, to_js};

use crate::providers::anthropic;
use crate::providers::openai_compat::OpenAiCompat;
use crate::providers::SendOptions;
use crate::proxy::post_json;
use crate::types::ProviderType;

/// Cap on tool-call rounds before we give up and return whatever we have.
const MAX_ITERS: usize = 12;

const AGENT_SYSTEM_PROMPT: &str = "You are AIPage, an agentic study assistant embedded in a sidebar on the EduPage school platform. You help the student understand and answer what is on their screen. Reply in Slovak unless the student writes in another language.\n\nTools available to you:\n- get_page_content: read the visible text of the EduPage page the student is viewing. Call it whenever your answer depends on what is on their screen.\n- get_exam_question: read the current exam question and its answer options.\n- fill_exam_answer: type an answer into the exam field. Only call this when the student explicitly asks you to fill or submit an answer.\n- web_search: search the web for current or factual information.\n\nDecide which tools to use on your own and chain them as needed, then give a clear, step-by-step answer. Don't ask permission for read-only actions (reading the page, searching). Ask before filling an answer unless the student already told you to.";

pub(crate) const WEB_SEARCH_SYSTEM_PROMPT: &str = "You are a web research assistant. Use the web_search tool to look up current or factual information, then synthesize a clear, well-structured answer in the student's language. Cite sources by URL when relevant. If the search returns no useful results, say so plainly.";

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

/// The same tools for Claude: the browser-side tools converted to Anthropic
/// `input_schema` tools, with the DuckDuckGo `web_search` function replaced
/// by Claude's server-side `web_search` tool (same name, so the agent system
/// prompt still applies; the API runs the searches itself).
fn anthropic_tools(model: &str) -> Value {
    let client_tools: Vec<Value> = openai_tools()
        .as_array()
        .map(|arr| {
            arr.iter()
                .filter(|t| t.pointer("/function/name").and_then(Value::as_str) != Some("web_search"))
                .cloned()
                .collect()
        })
        .unwrap_or_default();
    let mut tools = anthropic::tools_from_openai(&Value::Array(client_tools));
    if let Some(arr) = tools.as_array_mut() {
        arr.push(anthropic::web_search_tool(model));
    }
    tools
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

const NO_ACTIVE_TAB: &str = "No active EduPage tab is open.";

fn is_ok(r: &Value) -> bool {
    r.get("ok").and_then(Value::as_bool).unwrap_or(false)
}

async fn execute_page_content() -> (String, bool) {
    let Some(r) = tabs::send_json_to_active(&json!({ "action": "get_page_content" })).await else {
        return (NO_ACTIVE_TAB.into(), true);
    };
    match r.get("content").and_then(Value::as_str).filter(|s| !s.is_empty()) {
        Some(c) => (c.to_string(), false),
        None => ("Could not read the page content.".into(), true),
    }
}

async fn execute_exam_question() -> (String, bool) {
    let Some(r) = tabs::send_json_to_active(&json!({ "action": "get_exam_question" })).await else {
        return (NO_ACTIVE_TAB.into(), true);
    };
    if is_ok(&r) {
        (r.to_string(), false)
    } else {
        ("No exam question found on this page.".into(), true)
    }
}

async fn execute_fill_answer(input: &Value) -> (String, bool) {
    let value = input.get("value").and_then(Value::as_str).unwrap_or("");
    let input_type = input.get("inputType").and_then(Value::as_str);
    let msg = json!({ "action": "fill_answer", "payload": { "inputType": input_type, "value": value } });
    let Some(r) = tabs::send_json_to_active(&msg).await else {
        return (NO_ACTIVE_TAB.into(), true);
    };
    if is_ok(&r) {
        (format!("Filled answer: {value}"), false)
    } else {
        let err = r.get("error").and_then(Value::as_str).unwrap_or("unknown error");
        (format!("Could not fill answer: {err}"), true)
    }
}

/// DuckDuckGo instant-answer results (`{title, snippet, url}` objects) from
/// the background searcher; empty on any failure.
pub async fn duckduckgo_results(query: &str) -> Vec<Value> {
    let msg = to_js(&json!({ "action": "search_web", "payload": { "query": query } }));
    let resp = runtime::send_message(&msg).await.map(|v| from_js(&v)).unwrap_or(Value::Null);
    resp.get("results").and_then(Value::as_array).cloned().unwrap_or_default()
}

/// Run a DuckDuckGo search and format the results as tool-result text.
async fn run_duckduckgo_search(query: &str) -> (String, bool) {
    let results = duckduckgo_results(query).await;
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

/// Run a tool-calling round against an OpenAI-compatible backend.
///
/// Executes tool calls until the model returns a plain answer (no `tool_calls`)
/// or [`MAX_ITERS`] is reached. Assistant text accumulates across rounds
/// (joined with `\n\n`) and is streamed to `on_text` after each one.
async fn run_tool_loop<F>(
    cfg: &OpenAiCompat,
    api_key: &str,
    opts: &SendOptions,
    messages: &mut Vec<Value>,
    tools: &Value,
    on_text: &F,
) -> Result<String, String>
where
    F: Fn(String),
{
    let url = cfg.chat_url(opts);
    let headers = cfg.headers(api_key);
    let model = cfg.model_of(opts);
    let mut answer = String::new();

    for _ in 0..MAX_ITERS {
        let body = json!({ "model": model, "messages": messages, "tools": tools, "stream": false });
        let data = post_json(&url, &headers, &body).await?;
        let msg = data.pointer("/choices/0/message").cloned().unwrap_or(Value::Null);

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
            // Tool errors go back to the model as the result text so it can recover.
            let (content, _is_error) = execute_tool(name, &input).await;
            messages.push(json!({ "role": "tool", "tool_call_id": id, "content": content }));
        }
    }

    // Hit the iteration cap: return whatever we have rather than failing.
    Ok(answer)
}

/// Run a tool-calling round against the Anthropic Messages API.
///
/// Mirrors [`run_tool_loop`] for Claude's wire format: the response's full
/// `content` is echoed back as the assistant turn, every `tool_use` block is
/// executed and answered with a `tool_result` block in a single `user` turn
/// (the API expects all results together), and a `pause_turn` from the
/// server-side web search is resumed by re-sending the same history. The
/// loop ends on any other stop reason (`end_turn`, `max_tokens`, ...) or at
/// [`MAX_ITERS`]; a refusal is surfaced as an error by
/// [`anthropic::post_messages`].
async fn run_anthropic_tool_loop<F>(
    api_key: &str,
    opts: &SendOptions,
    system: &str,
    messages: &mut Vec<Value>,
    tools: &Value,
    on_text: &F,
) -> Result<String, String>
where
    F: Fn(String),
{
    let model = anthropic::model_of(opts);
    let mut answer = String::new();

    for _ in 0..MAX_ITERS {
        let body = anthropic::message_body(&model, system, messages, Some(tools));
        let resp = anthropic::post_messages(api_key, opts, &body).await?;

        let text = anthropic::text_blocks(&resp);
        if !text.is_empty() {
            if !answer.is_empty() {
                answer.push_str("\n\n");
            }
            answer.push_str(&text);
            on_text(answer.clone());
        }

        let tool_uses = anthropic::parse_tool_uses(&resp);
        match anthropic::stop_reason(&resp) {
            // Server-side tool loop hit its iteration limit: resume as-is.
            Some("pause_turn") => messages.push(anthropic::assistant_turn(&resp)),
            Some("tool_use") if !tool_uses.is_empty() => {
                messages.push(anthropic::assistant_turn(&resp));
                let mut results = Vec::with_capacity(tool_uses.len());
                for tu in &tool_uses {
                    let (content, is_error) = execute_tool(&tu.name, &tu.input).await;
                    results.push(anthropic::tool_result_block(&tu.id, &content, is_error));
                }
                messages.push(json!({ "role": "user", "content": results }));
            }
            _ => return Ok(answer),
        }
    }

    // Hit the iteration cap: return whatever we have rather than failing.
    Ok(answer)
}

/// Run one agentic chat turn for a tool-capable provider, streaming text via
/// `on_text`.
pub async fn run_agent_turn<F>(
    provider: ProviderType,
    api_key: &str,
    user_text: &str,
    opts: &SendOptions,
    on_text: F,
) -> Result<(), String>
where
    F: Fn(String),
{
    let answer = if provider == ProviderType::Anthropic {
        let mut messages = vec![json!({ "role": "user", "content": user_text })];
        let tools = anthropic_tools(&anthropic::model_of(opts));
        run_anthropic_tool_loop(api_key, opts, AGENT_SYSTEM_PROMPT, &mut messages, &tools, &on_text).await?
    } else {
        let cfg = OpenAiCompat::for_provider(provider);
        let mut messages = vec![
            json!({ "role": "system", "content": AGENT_SYSTEM_PROMPT }),
            json!({ "role": "user", "content": user_text }),
        ];
        let tools = openai_tools();
        run_tool_loop(cfg, api_key, opts, &mut messages, &tools, &on_text).await?
    };
    if answer.is_empty() {
        on_text("(Agent finished without a textual answer.)".to_string());
    }
    Ok(())
}

/// Native web search for a tool-capable provider: a tool-calling round with
/// only the `web_search` tool, returning the model's synthesized answer.
/// Claude searches server-side (see [`anthropic::web_search`]).
pub async fn web_search(
    provider: ProviderType,
    api_key: &str,
    query: &str,
    opts: &SendOptions,
) -> Result<String, String> {
    if provider == ProviderType::Anthropic {
        return anthropic::web_search(query, api_key, opts).await;
    }
    let cfg = OpenAiCompat::for_provider(provider);
    let mut messages = vec![
        json!({ "role": "system", "content": WEB_SEARCH_SYSTEM_PROMPT }),
        json!({ "role": "user", "content": query }),
    ];
    let tools = web_search_tool();
    let answer = run_tool_loop(cfg, api_key, opts, &mut messages, &tools, &|_| {}).await?;
    Ok(answer)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decodes_string_and_object_arguments() {
        assert_eq!(decode_arguments(&json!("{\"query\":\"x\"}")), json!({ "query": "x" }));
        assert_eq!(decode_arguments(&json!({ "query": "y" })), json!({ "query": "y" }));
        assert_eq!(decode_arguments(&json!("not json")), Value::Null);
    }

    #[test]
    fn tool_definitions_are_openai_function_tools() {
        for tool in openai_tools().as_array().unwrap() {
            assert_eq!(tool["type"], "function");
            assert!(tool["function"]["name"].is_string());
            assert!(tool["function"]["parameters"].is_object());
        }
        assert_eq!(web_search_tool()[0]["function"]["name"], "web_search");
    }

    #[test]
    fn anthropic_tools_share_definitions_and_use_server_search() {
        let tools = anthropic_tools("claude-opus-5-5");
        let arr = tools.as_array().unwrap();
        let openai = openai_tools();
        let openai_arr = openai.as_array().unwrap();
        assert_eq!(arr.len(), openai_arr.len(), "one Anthropic tool per OpenAI tool");
        // Browser-side tools keep their names, descriptions and schemas.
        for (a, o) in arr.iter().zip(openai_arr.iter()).take(arr.len() - 1) {
            assert_eq!(a["name"], o["function"]["name"]);
            assert_eq!(a["description"], o["function"]["description"]);
            assert_eq!(a["input_schema"], o["function"]["parameters"]);
            assert!(a.get("type").is_none());
        }
        assert_eq!(arr[2]["input_schema"]["required"], json!(["value"]));
        // The DuckDuckGo function tool is replaced by Claude's server-side search.
        let last = &arr[arr.len() - 1];
        assert_eq!(last["name"], "web_search");
        assert_eq!(last["type"], "web_search_20260209");
        assert!(last.get("input_schema").is_none());
        assert_eq!(arr.iter().filter(|t| t["name"] == "web_search").count(), 1);
        assert_eq!(anthropic_tools("claude-haiku-4-5")[3]["type"], "web_search_20250305");
    }
}
