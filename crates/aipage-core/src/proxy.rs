//! Bridge to the background CORS proxy. Mirrors `performRequest` in
//! `providers/utils.ts`.
//!
//! The sidebar iframe is cross-origin and cannot fetch external APIs directly,
//! so every provider request is forwarded to the background service worker via
//! `runtime.sendMessage({ action: 'proxy_fetch', payload })`. The background
//! performs the real `fetch` and returns `{ ok, data, error? }`.

use std::collections::HashMap;

use aipage_bindings::runtime;
use serde::Serialize;
use serde_json::Value;

#[derive(Serialize)]
struct ProxyPayload<'a> {
    url: &'a str,
    method: &'a str,
    headers: &'a HashMap<String, String>,
    body: Option<&'a str>,
}

#[derive(Serialize)]
struct ProxyMessage<'a> {
    action: &'a str,
    payload: ProxyPayload<'a>,
}

/// Perform an HTTP request through the background proxy and return the decoded
/// JSON body. If the body comes back as a JSON string it is parsed; otherwise
/// it is returned as-is.
pub async fn perform_request(
    url: &str,
    method: &str,
    headers: &HashMap<String, String>,
    body: Option<&str>,
) -> Result<Value, String> {
    let msg = ProxyMessage {
        action: "proxy_fetch",
        payload: ProxyPayload { url, method, headers, body },
    };
    // `json_compatible` serializes maps/structs as plain JS objects (not Maps),
    // which is what the background message handler expects.
    let js_msg = msg
        .serialize(&serde_wasm_bindgen::Serializer::json_compatible())
        .map_err(|e| format!("failed to serialize proxy message: {e:?}"))?;

    let resp = runtime::send_message(&js_msg)
        .await
        .map_err(|e| js_error_string(&e))?;

    if resp.is_null() || resp.is_undefined() {
        return Err("No response from background script".to_string());
    }

    let value: Value = serde_wasm_bindgen::from_value(resp)
        .map_err(|e| format!("failed to decode proxy response: {e:?}"))?;

    if value.get("ok").and_then(Value::as_bool).unwrap_or(false) {
        let data = value.get("data").cloned().unwrap_or(Value::Null);
        if let Value::String(s) = &data {
            if let Ok(parsed) = serde_json::from_str::<Value>(s) {
                return Ok(parsed);
            }
        }
        Ok(data)
    } else {
        Err(extract_error_message(&value))
    }
}

/// Convenience: a JSON POST with an `Authorization`-free header map built from
/// `(key, value)` pairs.
pub async fn post_json(
    url: &str,
    headers: &HashMap<String, String>,
    body: &Value,
) -> Result<Value, String> {
    let body_str = serde_json::to_string(body).map_err(|e| e.to_string())?;
    perform_request(url, "POST", headers, Some(&body_str)).await
}

/// Replicates the error-message extraction in `performRequest`'s failure path.
fn extract_error_message(resp: &Value) -> String {
    if let Some(data) = resp.get("data") {
        if data.is_object() {
            if let Some(m) = data.pointer("/error/message").and_then(Value::as_str) {
                return m.to_string();
            }
            if let Some(m) = data.get("message").and_then(Value::as_str) {
                return m.to_string();
            }
            return data.to_string();
        }
        if let Some(s) = data.as_str() {
            return s.to_string();
        }
    }
    if let Some(s) = resp.get("error").and_then(Value::as_str) {
        return s.to_string();
    }
    "Unknown error".to_string()
}

fn js_error_string(err: &wasm_bindgen::JsValue) -> String {
    let msg = err.as_string().unwrap_or_else(|| format!("{err:?}"));
    if msg.contains("Could not establish connection") {
        "Extension connection lost. Please refresh the page and the sidebar.".to_string()
    } else {
        msg
    }
}
