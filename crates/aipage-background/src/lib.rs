//! AIPage background service worker. Mirrors `src/background.ts`.
//!
//! Acts as the CORS proxy (`proxy_fetch`), serves DuckDuckGo instant-answer
//! search (`search_web`), toggles the sidebar on toolbar click, and runs the
//! auto-update manager. The background has host permissions, so it can `fetch`
//! the external APIs directly.

mod update;

use js_sys::{Array, Object, Reflect, Uint8Array};
use serde_json::{json, Value};
use wasm_bindgen::prelude::*;
use wasm_bindgen::JsCast;
use wasm_bindgen_futures::JsFuture;

use aipage_bindings::{runtime, tabs};

#[wasm_bindgen]
extern "C" {
    // Global `fetch`, available in both background-page and worker globals.
    #[wasm_bindgen(js_name = fetch)]
    fn js_fetch(input: JsValue, init: &JsValue) -> js_sys::Promise;
}

#[wasm_bindgen(start)]
pub fn start() {
    console_error_panic_hook::set_once();
    aipage_bindings::console::log("aipage background wasm loaded");

    // CORS proxy + web search.
    runtime::on_message(|message, _sender| async move {
        let action = get_str(&message, "action").unwrap_or_default();
        match action.as_str() {
            "proxy_fetch" => handle_proxy_fetch(message).await,
            "search_web" => handle_search_web(message).await,
            _ => JsValue::NULL,
        }
    });

    // Toolbar icon → toggle the sidebar in the active tab.
    aipage_bindings::action::on_clicked(|tab| {
        if let Some(id) = Reflect::get(&tab, &"id".into()).ok().and_then(|v| v.as_f64()) {
            let msg = obj(&[("action", JsValue::from_str("toggle_sidebar"))]);
            wasm_bindgen_futures::spawn_local(async move {
                let _ = tabs::send_message(id as i32, &msg).await;
            });
        }
    });

    // Auto-update check.
    update::init_update_manager();
}

// --- helpers ---

fn get_str(obj: &JsValue, key: &str) -> Option<String> {
    Reflect::get(obj, &JsValue::from_str(key)).ok().and_then(|v| v.as_string())
}

fn get_val(obj: &JsValue, key: &str) -> JsValue {
    Reflect::get(obj, &JsValue::from_str(key)).unwrap_or(JsValue::UNDEFINED)
}

/// Build a JS object from `(key, value)` pairs.
pub(crate) fn obj(pairs: &[(&str, JsValue)]) -> JsValue {
    let o = Object::new();
    for (k, v) in pairs {
        let _ = Reflect::set(&o, &JsValue::from_str(k), v);
    }
    o.into()
}

/// GET a URL and decode the JSON body. Used by the update manager.
pub(crate) async fn fetch_json(url: &str) -> Result<Value, String> {
    let resp = JsFuture::from(js_fetch(JsValue::from_str(url), &Object::new().into()))
        .await
        .map_err(|e| e.as_string().unwrap_or_default())?;
    let resp: web_sys::Response = resp.unchecked_into();
    if !resp.ok() {
        return Err(format!("HTTP {}", resp.status()));
    }
    let v = JsFuture::from(resp.json().map_err(|_| "no json".to_string())?)
        .await
        .map_err(|_| "json await failed".to_string())?;
    serde_wasm_bindgen::from_value(v).map_err(|e| format!("{e:?}"))
}

/// `{ ok: false, error }`.
fn error_response(msg: &str) -> JsValue {
    obj(&[("ok", JsValue::FALSE), ("error", JsValue::from_str(msg))])
}

/// `navigator.onLine`, defaulting to online if unavailable.
fn is_online() -> bool {
    js_sys::global()
        .dyn_into::<js_sys::Object>()
        .ok()
        .and_then(|g| Reflect::get(&g, &"navigator".into()).ok())
        .and_then(|nav| Reflect::get(&nav, &"onLine".into()).ok())
        .and_then(|v| v.as_bool())
        .unwrap_or(true)
}

/// Build a fetch-failure response, offline-aware (mirrors background.ts catch).
fn network_error(url: &str, detail: &str) -> JsValue {
    let msg = if !is_online() {
        format!("Network error: You appear to be offline. Failed to fetch {url}")
    } else {
        format!("Network error: Failed to fetch {url}. {detail}")
    };
    error_response(&msg)
}

async fn handle_proxy_fetch(message: JsValue) -> JsValue {
    let payload = get_val(&message, "payload");
    let url = match get_str(&payload, "url") {
        Some(u) => u,
        None => return error_response("Missing url"),
    };
    let method = get_str(&payload, "method").unwrap_or_else(|| "GET".to_string());
    let headers = get_val(&payload, "headers");
    let body = get_val(&payload, "body");
    let raw = get_val(&payload, "raw").as_bool().unwrap_or(false);

    // Build the fetch init object.
    let init = Object::new();
    let _ = Reflect::set(&init, &"method".into(), &JsValue::from_str(&method));
    if !headers.is_undefined() && !headers.is_null() {
        let _ = Reflect::set(&init, &"headers".into(), &headers);
    }
    let upper = method.to_uppercase();
    if body.is_string() && upper != "GET" && upper != "HEAD" {
        let _ = Reflect::set(&init, &"body".into(), &body);
    }

    let resp = match JsFuture::from(js_fetch(JsValue::from_str(&url), &init.into())).await {
        Ok(r) => r.unchecked_into::<web_sys::Response>(),
        Err(e) => {
            return network_error(&url, &e.as_string().unwrap_or_default());
        }
    };

    let ok = resp.ok();
    let status = resp.status();

    if raw {
        return build_raw_response(&resp, ok, status).await;
    }

    let content_type = resp.headers().get("content-type").ok().flatten().unwrap_or_default();
    if content_type.contains("application/json") {
        match JsFuture::from(resp.json().unwrap()).await {
            Ok(data) => response_with_data(ok, status, data),
            // Mirror the TS .catch path: a JSON-parse rejection surfaces as a
            // network-style error (offline-aware), not a fixed string.
            Err(e) => network_error(&url, &e.as_string().unwrap_or_default()),
        }
    } else if content_type.starts_with("image/") {
        match read_as_data_url(&resp, &content_type).await {
            Ok(data_url) => response_with_data(ok, status, JsValue::from_str(&data_url)),
            Err(_) => error_response("Failed to read blob"),
        }
    } else {
        match JsFuture::from(resp.text().unwrap()).await {
            Ok(text) => response_with_data(ok, status, text),
            Err(_) => error_response("Failed to read body"),
        }
    }
}

fn response_with_data(ok: bool, status: u16, data: JsValue) -> JsValue {
    obj(&[
        ("ok", JsValue::from_bool(ok)),
        ("status", JsValue::from_f64(status as f64)),
        ("data", data),
    ])
}

async fn build_raw_response(resp: &web_sys::Response, ok: bool, status: u16) -> JsValue {
    let headers_obj = Object::new();
    let entries = js_sys::try_iter(resp.headers().as_ref()).ok().flatten();
    if let Some(iter) = entries {
        for entry in iter.flatten() {
            let pair = Array::from(&entry);
            if pair.length() == 2 {
                let _ = Reflect::set(&headers_obj, &pair.get(0), &pair.get(1));
            }
        }
    }
    let text = JsFuture::from(resp.text().unwrap())
        .await
        .ok()
        .and_then(|v| v.as_string())
        .unwrap_or_default();

    obj(&[
        ("ok", JsValue::from_bool(ok)),
        ("status", JsValue::from_f64(status as f64)),
        ("statusText", JsValue::from_str(&resp.status_text())),
        ("headers", headers_obj.into()),
        ("body", JsValue::from_str(&text)),
    ])
}

/// Read an image response body and return a `data:<type>;base64,...` URL.
async fn read_as_data_url(resp: &web_sys::Response, content_type: &str) -> Result<String, ()> {
    let buf = JsFuture::from(resp.array_buffer().map_err(|_| ())?).await.map_err(|_| ())?;
    let bytes = Uint8Array::new(&buf).to_vec();
    Ok(format!("data:{};base64,{}", content_type, base64_encode(&bytes)))
}

async fn handle_search_web(message: JsValue) -> JsValue {
    let payload = get_val(&message, "payload");
    let query = get_str(&payload, "query").unwrap_or_default();
    let url = format!(
        "https://api.duckduckgo.com/?q={}&format=json",
        js_sys::encode_uri_component(&query)
    );

    let resp = match JsFuture::from(js_fetch(JsValue::from_str(&url), &Object::new().into())).await {
        Ok(r) => r.unchecked_into::<web_sys::Response>(),
        Err(e) => return error_response(&e.as_string().unwrap_or_else(|| "Search error".into())),
    };
    let data: Value = match JsFuture::from(resp.json().unwrap()).await {
        Ok(v) => serde_wasm_bindgen::from_value(v).unwrap_or(Value::Null),
        Err(_) => return error_response("Search error"),
    };

    let results = build_search_results(&data);
    let js = results
        .serialize(&serde_wasm_bindgen::Serializer::json_compatible())
        .unwrap_or(JsValue::NULL);
    obj(&[("ok", JsValue::TRUE), ("results", js)])
}

/// Extract up to 5 DuckDuckGo instant-answer results. Pure for testability.
fn build_search_results(data: &Value) -> Vec<Value> {
    let mut results: Vec<Value> = Vec::new();

    let abstract_text = data.get("AbstractText").and_then(Value::as_str).unwrap_or("");
    let abstract_url = data.get("AbstractURL").and_then(Value::as_str).unwrap_or("");
    if !abstract_text.is_empty() && !abstract_url.is_empty() {
        // `data.Heading || 'Answer'`: an empty Heading is falsy in JS.
        let heading = data
            .get("Heading")
            .and_then(Value::as_str)
            .filter(|s| !s.is_empty())
            .unwrap_or("Answer");
        results.push(json!({ "title": heading, "snippet": abstract_text, "url": abstract_url }));
    }

    if let Some(topics) = data.get("RelatedTopics").and_then(Value::as_array) {
        for topic in topics {
            if results.len() >= 5 {
                break;
            }
            let text = topic.get("Text").and_then(Value::as_str);
            let first_url = topic.get("FirstURL").and_then(Value::as_str);
            if let (Some(text), Some(url)) = (text, first_url) {
                // `text.substring(0, 100)` counts UTF-16 code units.
                let units: Vec<u16> = text.encode_utf16().take(100).collect();
                let title = String::from_utf16_lossy(&units);
                results.push(json!({ "title": title, "snippet": text, "url": url }));
            }
        }
    }
    results
}

use serde::Serialize;

/// Minimal base64 encoder (standard alphabet, padded).
fn base64_encode(input: &[u8]) -> String {
    const ALPHABET: &[u8; 64] =
        b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity(input.len().div_ceil(3) * 4);
    for chunk in input.chunks(3) {
        let b = [
            chunk[0],
            *chunk.get(1).unwrap_or(&0),
            *chunk.get(2).unwrap_or(&0),
        ];
        let n = ((b[0] as u32) << 16) | ((b[1] as u32) << 8) | (b[2] as u32);
        out.push(ALPHABET[((n >> 18) & 0x3f) as usize] as char);
        out.push(ALPHABET[((n >> 12) & 0x3f) as usize] as char);
        out.push(if chunk.len() > 1 { ALPHABET[((n >> 6) & 0x3f) as usize] as char } else { '=' });
        out.push(if chunk.len() > 2 { ALPHABET[(n & 0x3f) as usize] as char } else { '=' });
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn base64_matches_known_vectors() {
        assert_eq!(base64_encode(b""), "");
        assert_eq!(base64_encode(b"f"), "Zg==");
        assert_eq!(base64_encode(b"fo"), "Zm8=");
        assert_eq!(base64_encode(b"foo"), "Zm9v");
        assert_eq!(base64_encode(b"foobar"), "Zm9vYmFy");
    }

    #[test]
    fn search_results_extract_abstract_and_topics() {
        let data = json!({
            "Heading": "Rust",
            "AbstractText": "A systems language",
            "AbstractURL": "https://rust-lang.org",
            "RelatedTopics": [
                { "Text": "Cargo build tool", "FirstURL": "https://doc.rust-lang.org/cargo" },
                { "Nested": "ignored" }
            ]
        });
        let results = build_search_results(&data);
        assert_eq!(results.len(), 2);
        assert_eq!(results[0]["title"], "Rust");
        assert_eq!(results[1]["url"], "https://doc.rust-lang.org/cargo");
    }

    #[test]
    fn empty_heading_defaults_to_answer() {
        let data = json!({
            "Heading": "",
            "AbstractText": "text",
            "AbstractURL": "https://x"
        });
        let results = build_search_results(&data);
        assert_eq!(results[0]["title"], "Answer");
    }

    #[test]
    fn search_caps_at_five_results() {
        let topics: Vec<Value> = (0..10)
            .map(|i| json!({ "Text": format!("t{i}"), "FirstURL": format!("https://x/{i}") }))
            .collect();
        let data = json!({ "RelatedTopics": topics });
        assert_eq!(build_search_results(&data).len(), 5);
    }
}
