//! Anthropic Managed-Agents loop. Mirrors `providers/agent/managed-agent.ts`.
//!
//! Anthropic runs the agent loop server-side; we host the *custom* browser
//! tools (page scrape / exam fill) and drive the session by **polling**
//! `sessions/{id}/events` (the sidebar's only network path is the one-shot
//! background CORS proxy — no SSE).
//!
//! NOTE: these are Anthropic beta endpoints. The exact beta wire format is not
//! verifiable offline; on any error this returns `Err`, and callers fall back
//! to a direct Claude reply exactly like the TS `sendAgentMessage`.

use std::collections::HashMap;

use serde_json::{json, Value};
use wasm_bindgen::JsValue;

use crate::proxy::perform_request;

const DEFAULT_MODEL: &str = "claude-opus-4-8";
const API_BASE: &str = "https://api.anthropic.com/v1";
const ANTHROPIC_VERSION: &str = "2023-06-01";
const AGENTS_BETA: &str = "agents-2026-04-01";
const SCHEMA_VERSION: f64 = 1.0;
const MAX_POLLS: usize = 160;

const AGENT_SYSTEM_PROMPT: &str = "You are AIPage, an agentic study assistant embedded in a sidebar on the EduPage school platform. You help the student understand and answer what is on their screen. Reply in Slovak unless the student writes in another language.\n\nTools available to you:\n- get_page_content: read the visible text of the EduPage page the student is viewing. Call it whenever your answer depends on what is on their screen.\n- get_exam_question: read the current exam question and its answer options.\n- fill_exam_answer: type an answer into the exam field. Only call this when the student explicitly asks you to fill or submit an answer.\n- web_search: search the web for current or factual information.\n\nDecide which tools to use on your own and chain them as needed, then give a clear, step-by-step answer. Don't ask permission for read-only actions (reading the page, searching). Ask before filling an answer unless the student already told you to.";

fn headers(api_key: &str) -> HashMap<String, String> {
    let mut h = HashMap::new();
    h.insert("content-type".into(), "application/json".into());
    h.insert("x-api-key".into(), api_key.to_string());
    h.insert("anthropic-version".into(), ANTHROPIC_VERSION.into());
    h.insert("anthropic-beta".into(), AGENTS_BETA.into());
    h
}

fn custom_tools() -> Value {
    json!([
        { "type": "custom", "name": "get_page_content", "description": "Read the visible text content of the EduPage page the student is currently viewing. Call this whenever answering depends on what is on the page.", "input_schema": { "type": "object", "properties": {} } },
        { "type": "custom", "name": "get_exam_question", "description": "Read the current exam question and its answer options from the page.", "input_schema": { "type": "object", "properties": {} } },
        { "type": "custom", "name": "fill_exam_answer", "description": "Fill an answer into the current exam field on the page. Call only when the student explicitly asks to fill or submit an answer.", "input_schema": { "type": "object", "properties": { "value": { "type": "string", "description": "The answer text or option value to fill in." }, "inputType": { "type": "string", "description": "Optional input type, e.g. \"choice\" or \"text\"." } }, "required": ["value"] } }
    ])
}

async fn sleep(ms: u32) {
    gloo_timers::future::TimeoutFuture::new(ms).await;
}

// --- cached agent/environment resources ---

async fn cached_resources() -> Option<(String, String)> {
    use js_sys::{Array, Reflect};
    let keys = Array::of3(&"ma_agent_id".into(), &"ma_env_id".into(), &"ma_schema".into());
    let result = aipage_bindings::storage::local_get(keys.as_ref()).await.ok()?;
    let agent = Reflect::get(&result, &"ma_agent_id".into()).ok()?.as_string()?;
    let env = Reflect::get(&result, &"ma_env_id".into()).ok()?.as_string()?;
    let schema = Reflect::get(&result, &"ma_schema".into()).ok()?.as_f64()?;
    if schema == SCHEMA_VERSION {
        Some((agent, env))
    } else {
        None
    }
}

async fn cache_resources(agent_id: &str, env_id: &str) {
    use js_sys::{Object, Reflect};
    let obj = Object::new();
    let _ = Reflect::set(&obj, &"ma_agent_id".into(), &JsValue::from_str(agent_id));
    let _ = Reflect::set(&obj, &"ma_env_id".into(), &JsValue::from_str(env_id));
    let _ = Reflect::set(&obj, &"ma_schema".into(), &JsValue::from_f64(SCHEMA_VERSION));
    let _ = aipage_bindings::storage::local_set(obj.as_ref()).await;
}

async fn ensure_resources(api_key: &str) -> Result<(String, String), String> {
    if let Some(pair) = cached_resources().await {
        return Ok(pair);
    }
    let h = headers(api_key);

    let env_name = format!("aipage-{}", js_sys::Date::now() as u64);
    let env_body = json!({ "name": env_name, "config": { "type": "cloud", "networking": { "type": "unrestricted" } } });
    let env = perform_request(&format!("{API_BASE}/environments"), "POST", &h, Some(&env_body.to_string())).await?;
    let env_id = env.get("id").and_then(Value::as_str).ok_or("environment create failed")?.to_string();

    let agent_body = json!({
        "name": "AIPage Study Agent",
        "model": DEFAULT_MODEL,
        "system": AGENT_SYSTEM_PROMPT,
        "tools": json!([
            { "type": "agent_toolset_20260401", "default_config": { "enabled": false }, "configs": [{ "name": "web_search", "enabled": true }] }
        ]).as_array().unwrap().iter().cloned().chain(custom_tools().as_array().unwrap().iter().cloned()).collect::<Vec<_>>(),
    });
    let agent = perform_request(&format!("{API_BASE}/agents"), "POST", &h, Some(&agent_body.to_string())).await?;
    let agent_id = agent.get("id").and_then(Value::as_str).ok_or("agent create failed")?.to_string();

    cache_resources(&agent_id, &env_id).await;
    Ok((agent_id, env_id))
}

/// Execute a browser-side custom tool by messaging the active EduPage tab.
async fn execute_tool(name: &str, input: &Value) -> (String, bool) {
    let tab_id = match active_tab_id().await {
        Some(id) => id,
        None => return ("No active EduPage tab is open.".into(), true),
    };
    match name {
        "get_page_content" => {
            let r = send_to_tab(tab_id, json!({ "action": "get_page_content" })).await;
            match r.get("content").and_then(Value::as_str).filter(|s| !s.is_empty()) {
                Some(c) => (c.to_string(), false),
                None => ("Could not read the page content.".into(), true),
            }
        }
        "get_exam_question" => {
            let r = send_to_tab(tab_id, json!({ "action": "get_exam_question" })).await;
            if r.get("ok").and_then(Value::as_bool).unwrap_or(false) {
                (r.to_string(), false)
            } else {
                ("No exam question found on this page.".into(), true)
            }
        }
        "fill_exam_answer" => {
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
        other => (format!("Unknown tool: {other}"), true),
    }
}

async fn active_tab_id() -> Option<i32> {
    let q = to_js(&json!({ "active": true, "lastFocusedWindow": true }));
    let tabs = aipage_bindings::tabs::query(&q).await.ok()?;
    let first = js_sys::Array::from(&tabs).get(0);
    js_sys::Reflect::get(&first, &"id".into()).ok().and_then(|v| v.as_f64()).map(|n| n as i32)
}

async fn send_to_tab(tab_id: i32, msg: Value) -> Value {
    match aipage_bindings::tabs::send_message(tab_id, &to_js(&msg)).await {
        Ok(v) => serde_wasm_bindgen::from_value(v).unwrap_or(Value::Null),
        Err(_) => Value::Null,
    }
}

fn to_js(v: &Value) -> JsValue {
    use serde::Serialize;
    v.serialize(&serde_wasm_bindgen::Serializer::json_compatible()).unwrap_or(JsValue::NULL)
}

/// Run one managed-agent turn, streaming text via `on_text`, returning the
/// (possibly new) session id.
pub async fn run_agent_turn<F>(
    api_key: &str,
    user_text: &str,
    session_id: Option<String>,
    on_text: F,
) -> Result<String, String>
where
    F: Fn(String) + 'static,
{
    let h = headers(api_key);
    let (agent_id, env_id) = ensure_resources(api_key).await?;

    // Create the session on first use, then reuse it across the conversation.
    let sid = match session_id {
        Some(s) => s,
        None => {
            let body = json!({ "agent": agent_id, "environment_id": env_id });
            let session = perform_request(&format!("{API_BASE}/sessions"), "POST", &h, Some(&body.to_string())).await?;
            session.get("id").and_then(Value::as_str).ok_or("session create failed")?.to_string()
        }
    };

    let events_url = format!("{API_BASE}/sessions/{sid}/events");

    // Send the user's message.
    let send_body = json!({ "events": [{ "type": "user.message", "content": [{ "type": "text", "text": user_text }] }] });
    perform_request(&events_url, "POST", &h, Some(&send_body.to_string())).await?;

    let mut seen: std::collections::HashSet<String> = std::collections::HashSet::new();
    let mut answered: std::collections::HashSet<String> = std::collections::HashSet::new();
    let mut answer = String::new();

    for _ in 0..MAX_POLLS {
        let events = match perform_request(&events_url, "GET", &h, None).await {
            Ok(v) => v.get("data").and_then(Value::as_array).cloned().unwrap_or_default(),
            Err(_) => {
                sleep(1500).await;
                continue;
            }
        };

        let mut pending: Vec<Value> = Vec::new();
        let mut terminal = false;

        for ev in &events {
            let id = ev.get("id").and_then(Value::as_str).unwrap_or("");
            let is_new = !id.is_empty() && !seen.contains(id);
            if !id.is_empty() {
                seen.insert(id.to_string());
            }
            match ev.get("type").and_then(Value::as_str) {
                Some("agent.message") => {
                    if is_new {
                        if let Some(content) = ev.get("content").and_then(Value::as_array) {
                            let txt: String = content
                                .iter()
                                .filter(|b| b.get("type").and_then(Value::as_str) == Some("text"))
                                .filter_map(|b| b.get("text").and_then(Value::as_str))
                                .collect();
                            if !txt.is_empty() {
                                if !answer.is_empty() {
                                    answer.push_str("\n\n");
                                }
                                answer.push_str(&txt);
                                on_text(answer.clone());
                            }
                        }
                    }
                }
                Some("agent.custom_tool_use") => {
                    if !id.is_empty() && !answered.contains(id) {
                        pending.push(ev.clone());
                    }
                }
                Some("session.status_terminated") => terminal = true,
                Some("session.status_idle") => {
                    let reason = ev.pointer("/stop_reason/type").and_then(Value::as_str);
                    if let Some(r) = reason {
                        if r != "requires_action" {
                            terminal = true;
                        }
                    }
                }
                _ => {}
            }
        }

        if !pending.is_empty() {
            for ev in pending {
                let id = ev.get("id").and_then(Value::as_str).unwrap_or("").to_string();
                let name = ev.get("name").and_then(Value::as_str).unwrap_or("");
                let input = ev.get("input").cloned().unwrap_or(Value::Null);
                let (content, is_error) = execute_tool(name, &input).await;
                answered.insert(id.clone());
                let body = json!({ "events": [{ "type": "user.custom_tool_result", "custom_tool_use_id": id, "content": [{ "type": "text", "text": content }], "is_error": is_error }] });
                let _ = perform_request(&events_url, "POST", &h, Some(&body.to_string())).await;
            }
            sleep(800).await;
            continue;
        }

        if terminal {
            break;
        }
        sleep(1500).await;
    }

    if answer.is_empty() {
        on_text("(Agent finished without a textual answer.)".to_string());
    }
    Ok(sid)
}
