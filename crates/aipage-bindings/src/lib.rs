//! Hand-rolled bindings to the WebExtension API surface used by AIPage.
//!
//! We bind to the **callback-based `chrome.*` namespace**, which Chrome,
//! Firefox and Safari all expose, and wrap the callbacks into Rust futures.
//! This gives one uniform, promise-like API across every target without
//! shipping any JavaScript polyfill.
//!
//! # Transports
//!
//! The sidebar can also run as a plain web page (the hosted, auto-updating
//! UI) where `chrome.*` does not exist. [`transport`] detects that once at
//! startup and the API wrappers below route the five calls the sidebar needs
//! (`runtime.sendMessage`, `storage.local.get/set`, `storage.onChanged`,
//! `tabs.query/sendMessage`) through the [`bridge`] instead; callers are
//! unaffected. Everything else (`runtime.getURL`, `onMessage`, `alarms`, …) is
//! only ever used from extension contexts and stays direct.

pub mod bridge;
pub mod idb;

use std::cell::Cell;

use js_sys::{Function, Object, Promise, Reflect};
use serde::Serialize;
use serde_json::Value;
use wasm_bindgen::prelude::*;
use wasm_bindgen::JsCast;
use wasm_bindgen_futures::JsFuture;

pub type JsResult = Result<JsValue, JsValue>;

// --- JSON <-> JS interop ---

/// Serialize a serde value to a plain JS object/array (not `Map`), which is
/// what the extension message handlers expect.
pub fn to_js<T: Serialize>(v: &T) -> JsValue {
    v.serialize(&serde_wasm_bindgen::Serializer::json_compatible())
        .unwrap_or(JsValue::NULL)
}

/// Convert an arbitrary JS value to JSON. `undefined`, functions and anything
/// that cannot be represented become `null`.
pub fn from_js(v: &JsValue) -> Value {
    if v.is_undefined() || v.is_null() {
        return Value::Null;
    }
    serde_wasm_bindgen::from_value(v.clone()).unwrap_or(Value::Null)
}

/// Build a JS object from `(key, value)` pairs.
pub fn js_object(pairs: &[(&str, JsValue)]) -> JsValue {
    let o = Object::new();
    for (k, v) in pairs {
        let _ = Reflect::set(&o, &JsValue::from_str(k), v);
    }
    o.into()
}

#[wasm_bindgen]
extern "C" {
    // --- console ---
    #[wasm_bindgen(js_namespace = console)]
    pub fn log(s: &str);
    #[wasm_bindgen(js_namespace = console, js_name = warn)]
    pub fn warn(s: &str);
    #[wasm_bindgen(js_namespace = console, js_name = error)]
    pub fn error(s: &str);

    // --- runtime ---
    #[wasm_bindgen(js_namespace = ["chrome", "runtime"], js_name = getURL)]
    fn chrome_runtime_get_url(path: &str) -> String;
    #[wasm_bindgen(js_namespace = ["chrome", "runtime"], js_name = sendMessage)]
    fn chrome_runtime_send_message(msg: &JsValue, cb: &Function);
    #[wasm_bindgen(js_namespace = ["chrome", "runtime", "onMessage"], js_name = addListener)]
    fn chrome_runtime_on_message_add(cb: &Function);

    // --- storage.local ---
    #[wasm_bindgen(js_namespace = ["chrome", "storage", "local"], js_name = get)]
    fn chrome_storage_local_get(keys: &JsValue, cb: &Function);
    #[wasm_bindgen(js_namespace = ["chrome", "storage", "local"], js_name = set)]
    fn chrome_storage_local_set(items: &JsValue, cb: &Function);
    #[wasm_bindgen(js_namespace = ["chrome", "storage", "onChanged"], js_name = addListener)]
    fn chrome_storage_on_changed_add(cb: &Function);

    // --- tabs ---
    #[wasm_bindgen(js_namespace = ["chrome", "tabs"], js_name = sendMessage)]
    fn chrome_tabs_send_message(tab_id: i32, msg: &JsValue, cb: &Function);
    #[wasm_bindgen(js_namespace = ["chrome", "tabs"], js_name = query)]
    fn chrome_tabs_query(query: &JsValue, cb: &Function);
    #[wasm_bindgen(js_namespace = ["chrome", "tabs"], js_name = create)]
    fn chrome_tabs_create(props: &JsValue, cb: &Function);

    // --- notifications ---
    #[wasm_bindgen(js_namespace = ["chrome", "notifications"], js_name = create)]
    fn chrome_notifications_create(id: &str, opts: &JsValue);
    #[wasm_bindgen(js_namespace = ["chrome", "notifications"], js_name = clear)]
    fn chrome_notifications_clear(id: &str);

    // --- downloads ---
    #[wasm_bindgen(js_namespace = ["chrome", "downloads"], js_name = download)]
    fn chrome_downloads_download(opts: &JsValue, cb: &Function);

    // --- alarms ---
    #[wasm_bindgen(js_namespace = ["chrome", "alarms"], js_name = create)]
    fn chrome_alarms_create(name: &str, info: &JsValue);
    #[wasm_bindgen(js_namespace = ["chrome", "alarms", "onAlarm"], js_name = addListener)]
    fn chrome_alarms_on_alarm_add(cb: &Function);
}

/// How the extension API is reached from the current context.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Transport {
    /// `chrome.*` is available: extension pages, background, content scripts.
    Direct,
    /// No `chrome.*`: the sidebar is a hosted web page framed by the content
    /// script, which proxies calls over [`bridge`].
    Bridge,
}

thread_local! {
    static TRANSPORT: Cell<Option<Transport>> = const { Cell::new(None) };
}

fn detect_transport() -> Transport {
    fn is_function(obj: &JsValue, key: &str) -> bool {
        Reflect::get(obj, &JsValue::from_str(key))
            .map(|v| v.is_function())
            .unwrap_or(false)
    }
    fn get(obj: &JsValue, key: &str) -> JsValue {
        Reflect::get(obj, &JsValue::from_str(key)).unwrap_or(JsValue::UNDEFINED)
    }
    let chrome = get(&js_sys::global(), "chrome");
    if !chrome.is_object() {
        return Transport::Bridge;
    }
    // Web pages may see a partial `chrome.runtime` (externally_connectable);
    // `chrome.storage` only ever exists in extension contexts, so require both.
    let runtime = get(&chrome, "runtime");
    let local = get(&get(&chrome, "storage"), "local");
    if runtime.is_object() && is_function(&runtime, "sendMessage") && local.is_object() && is_function(&local, "get") {
        Transport::Direct
    } else {
        Transport::Bridge
    }
}

/// The transport in use, detected once on first call.
pub fn transport() -> Transport {
    TRANSPORT.with(|t| match t.get() {
        Some(tr) => tr,
        None => {
            let tr = detect_transport();
            t.set(Some(tr));
            tr
        }
    })
}

/// Wrap a callback-style chrome API call into an awaitable future.
///
/// `invoke` receives the JS callback to hand to the chrome function. The
/// callback's single argument becomes the resolved value.
async fn promisify<F>(invoke: F) -> JsResult
where
    F: FnOnce(&Function),
{
    let mut invoke = Some(invoke);
    let promise = Promise::new(&mut |resolve, _reject| {
        let cb = Closure::once_into_js(move |result: JsValue| {
            let _ = resolve.call1(&JsValue::NULL, &result);
        });
        if let Some(invoke) = invoke.take() {
            invoke(cb.unchecked_ref());
        }
    });
    JsFuture::from(promise).await
}

pub mod console {
    //! Thin logging helpers.
    pub fn log(s: impl AsRef<str>) {
        super::log(s.as_ref());
    }
    pub fn warn(s: impl AsRef<str>) {
        super::warn(s.as_ref());
    }
    pub fn error(s: impl AsRef<str>) {
        super::error(s.as_ref());
    }
}

pub mod runtime {
    use super::*;

    /// `chrome.runtime.getURL(path)` — resolve an extension resource URL.
    pub fn get_url(path: &str) -> String {
        chrome_runtime_get_url(path)
    }

    /// `chrome.runtime.sendMessage(msg)` awaited for its response.
    pub async fn send_message(msg: &JsValue) -> JsResult {
        match transport() {
            Transport::Direct => promisify(|cb| chrome_runtime_send_message(msg, cb)).await,
            Transport::Bridge => bridge::call(bridge::Method::RuntimeSendMessage, &[msg]).await,
        }
    }

    /// Register a `chrome.runtime.onMessage` listener.
    ///
    /// The handler receives `(message, sender)` and returns a future producing
    /// the response. We always return `true` synchronously to chrome so the
    /// async `sendResponse` channel stays open across browsers (MV2 semantics).
    pub fn on_message<F, Fut>(handler: F)
    where
        F: Fn(JsValue, JsValue) -> Fut + 'static,
        Fut: std::future::Future<Output = JsValue> + 'static,
    {
        let cb = Closure::wrap(Box::new(
            move |message: JsValue, sender: JsValue, send_response: Function| -> JsValue {
                let fut = handler(message, sender);
                wasm_bindgen_futures::spawn_local(async move {
                    let result = fut.await;
                    let _ = send_response.call1(&JsValue::NULL, &result);
                });
                JsValue::TRUE
            },
        )
            as Box<dyn Fn(JsValue, JsValue, Function) -> JsValue>);
        chrome_runtime_on_message_add(cb.as_ref().unchecked_ref());
        cb.forget();
    }
}

pub mod storage {
    use super::*;

    /// `chrome.storage.local.get(keys)`. Pass an array of key strings (or null
    /// for everything). Resolves to an object map of stored values.
    pub async fn local_get(keys: &JsValue) -> JsResult {
        match transport() {
            Transport::Direct => promisify(|cb| chrome_storage_local_get(keys, cb)).await,
            Transport::Bridge => bridge::call(bridge::Method::StorageLocalGet, &[keys]).await,
        }
    }

    /// `chrome.storage.local.set(items)` where `items` is an object map.
    pub async fn local_set(items: &JsValue) -> JsResult {
        match transport() {
            Transport::Direct => promisify(|cb| chrome_storage_local_set(items, cb)).await,
            Transport::Bridge => bridge::call(bridge::Method::StorageLocalSet, &[items]).await,
        }
    }

    /// Register a `chrome.storage.onChanged` listener `(changes, areaName)`.
    pub fn on_changed<F>(handler: F)
    where
        F: Fn(JsValue, JsValue) + 'static,
    {
        match transport() {
            Transport::Direct => {
                let cb = Closure::wrap(Box::new(move |changes: JsValue, area: JsValue| {
                    handler(changes, area);
                }) as Box<dyn Fn(JsValue, JsValue)>);
                chrome_storage_on_changed_add(cb.as_ref().unchecked_ref());
                cb.forget();
            }
            Transport::Bridge => bridge::on_storage_changed(std::rc::Rc::new(handler)),
        }
    }
}

pub mod tabs {
    use super::*;

    /// `chrome.tabs.sendMessage(tabId, msg)` awaited for its response.
    pub async fn send_message(tab_id: i32, msg: &JsValue) -> JsResult {
        match transport() {
            Transport::Direct => promisify(|cb| chrome_tabs_send_message(tab_id, msg, cb)).await,
            Transport::Bridge => {
                bridge::call(bridge::Method::TabsSendMessage, &[&JsValue::from_f64(tab_id as f64), msg]).await
            }
        }
    }

    /// `chrome.tabs.query(queryInfo)` resolving to an array of tab objects.
    pub async fn query(query_info: &JsValue) -> JsResult {
        match transport() {
            Transport::Direct => promisify(|cb| chrome_tabs_query(query_info, cb)).await,
            Transport::Bridge => bridge::call(bridge::Method::TabsQuery, &[query_info]).await,
        }
    }

    /// `chrome.tabs.create({ url })`: open `url` in a new tab. Over the
    /// bridge the content script asks the background to do it (content
    /// scripts have no `chrome.tabs`).
    pub async fn create(url: &str) -> JsResult {
        let props = js_object(&[("url", JsValue::from_str(url))]);
        match transport() {
            Transport::Direct => promisify(|cb| chrome_tabs_create(&props, cb)).await,
            Transport::Bridge => bridge::call(bridge::Method::TabsCreate, &[&props]).await,
        }
    }

    /// Id of the active tab in the last focused window, if any.
    pub async fn active_tab_id() -> Option<i32> {
        let q = to_js(&serde_json::json!({ "active": true, "lastFocusedWindow": true }));
        let tabs = query(&q).await.ok()?;
        let first = js_sys::Array::from(&tabs).get(0);
        Reflect::get(&first, &"id".into())
            .ok()
            .and_then(|v| v.as_f64())
            .map(|n| n as i32)
    }

    /// [`send_message`] with a JSON payload; the reply as JSON, `Null` when
    /// the tab did not answer (no listener, tab gone).
    pub async fn send_json(tab_id: i32, msg: &Value) -> Value {
        match send_message(tab_id, &to_js(msg)).await {
            Ok(v) => from_js(&v),
            Err(_) => Value::Null,
        }
    }

    /// [`send_json`] to the active tab; `None` when no tab is open.
    pub async fn send_json_to_active(msg: &Value) -> Option<Value> {
        let tab_id = active_tab_id().await?;
        Some(send_json(tab_id, msg).await)
    }
}

pub mod action {
    use super::*;

    /// The toolbar-button API object: `chrome.action` (Manifest V3) or
    /// `chrome.browserAction` (Manifest V2); whichever the manifest enabled.
    fn api() -> Option<JsValue> {
        let chrome = Reflect::get(&js_sys::global(), &"chrome".into()).ok()?;
        ["action", "browserAction"]
            .iter()
            .filter_map(|k| Reflect::get(&chrome, &JsValue::from_str(k)).ok())
            .find(|v| v.is_object())
    }

    /// Register a toolbar-button click listener `(tab)` on
    /// `chrome.action.onClicked` or `chrome.browserAction.onClicked`.
    /// Logs and returns without registering when neither API exists.
    pub fn on_clicked<F>(handler: F)
    where
        F: Fn(JsValue) + 'static,
    {
        let Some(api) = api() else {
            super::console::warn("aipage: neither chrome.action nor chrome.browserAction is available");
            return;
        };
        let on_clicked = Reflect::get(&api, &"onClicked".into()).unwrap_or(JsValue::UNDEFINED);
        let add = Reflect::get(&on_clicked, &"addListener".into())
            .ok()
            .and_then(|f| f.dyn_into::<Function>().ok());
        let Some(add) = add else {
            super::console::warn("aipage: action.onClicked.addListener is not a function");
            return;
        };
        let cb = Closure::wrap(Box::new(move |tab: JsValue| handler(tab)) as Box<dyn Fn(JsValue)>);
        let _ = add.call1(&on_clicked, cb.as_ref().unchecked_ref());
        cb.forget();
    }
}

pub mod identity {
    //! `chrome.identity` (Chrome, Firefox; absent on Safari): the OAuth
    //! redirect URL and `launchWebAuthFlow`. Bound dynamically so a missing
    //! namespace is reported as "unavailable" instead of throwing, and
    //! `runtime.lastError` (user closed the window, bad redirect) becomes an
    //! `Err`. Over the bridge both calls are relayed to the background,
    //! which is the only bridge end with the `identity` API.
    use super::*;

    /// `chrome.identity` when it exists and has `launchWebAuthFlow`.
    fn api() -> Option<JsValue> {
        let chrome = Reflect::get(&js_sys::global(), &"chrome".into()).ok()?;
        let identity = Reflect::get(&chrome, &"identity".into()).ok()?;
        let has_launch = Reflect::get(&identity, &"launchWebAuthFlow".into())
            .map(|f| f.is_function())
            .unwrap_or(false);
        (identity.is_object() && has_launch).then_some(identity)
    }

    /// Whether this context has the identity API (direct transport only).
    pub fn available() -> bool {
        transport() == Transport::Direct && api().is_some()
    }

    fn get_redirect_url_direct() -> Option<String> {
        let identity = api()?;
        let f = Reflect::get(&identity, &"getRedirectURL".into()).ok()?.dyn_into::<Function>().ok()?;
        f.call0(&identity).ok()?.as_string()
    }

    /// `chrome.identity.getRedirectURL()`: the URL to register with the
    /// OAuth provider (`https://<id>.chromiumapp.org/` on Chrome,
    /// `https://<uuid>.extensions.allizom.org/` on Firefox). `None` when the
    /// browser has no identity API.
    pub async fn get_redirect_url() -> Option<String> {
        match transport() {
            Transport::Direct => get_redirect_url_direct(),
            Transport::Bridge => bridge::call(bridge::Method::IdentityGetRedirectUrl, &[])
                .await
                .ok()
                .and_then(|v| v.as_string()),
        }
    }

    /// `chrome.runtime.lastError.message`, if set.
    fn last_error() -> Option<String> {
        let chrome = Reflect::get(&js_sys::global(), &"chrome".into()).ok()?;
        let runtime = Reflect::get(&chrome, &"runtime".into()).ok()?;
        let err = Reflect::get(&runtime, &"lastError".into()).ok()?;
        if err.is_undefined() || err.is_null() {
            return None;
        }
        Some(
            Reflect::get(&err, &"message".into())
                .ok()
                .and_then(|m| m.as_string())
                .unwrap_or_else(|| "identity.launchWebAuthFlow failed".to_string()),
        )
    }

    async fn launch_direct(url: &str) -> Result<String, String> {
        let identity = api().ok_or("this browser has no identity API")?;
        let launch = Reflect::get(&identity, &"launchWebAuthFlow".into())
            .ok()
            .and_then(|f| f.dyn_into::<Function>().ok())
            .ok_or("identity.launchWebAuthFlow is unavailable")?;
        let details = js_object(&[("url", JsValue::from_str(url)), ("interactive", JsValue::TRUE)]);
        let promise = Promise::new(&mut |resolve, _reject| {
            let resolve_on_throw = resolve.clone();
            let cb = Closure::once_into_js(move |result: JsValue| {
                // Report lastError through the resolved value: a string
                // redirect URL on success, `{ error }` on failure.
                let out = match last_error() {
                    Some(e) => js_object(&[("error", JsValue::from_str(&e))]),
                    None => result,
                };
                let _ = resolve.call1(&JsValue::NULL, &out);
            });
            if launch.call2(&identity, &details, cb.unchecked_ref()).is_err() {
                let _ = resolve_on_throw.call1(
                    &JsValue::NULL,
                    &js_object(&[("error", JsValue::from_str("identity.launchWebAuthFlow threw"))]),
                );
            }
        });
        let out = JsFuture::from(promise).await.map_err(|e| e.as_string().unwrap_or_else(|| format!("{e:?}")))?;
        if let Some(url) = out.as_string() {
            return Ok(url);
        }
        let err = Reflect::get(&out, &"error".into()).ok().and_then(|e| e.as_string());
        Err(err.unwrap_or_else(|| "the sign-in window was closed".to_string()))
    }

    /// `chrome.identity.launchWebAuthFlow({ url, interactive: true })`:
    /// opens the authorization page and resolves to the final redirect URL
    /// (query string included).
    pub async fn launch_web_auth_flow(url: &str) -> Result<String, String> {
        match transport() {
            Transport::Direct => launch_direct(url).await,
            Transport::Bridge => bridge::call(bridge::Method::IdentityLaunchWebAuthFlow, &[&JsValue::from_str(url)])
                .await
                .map_err(|e| e.as_string().unwrap_or_else(|| format!("{e:?}")))
                .and_then(|v| v.as_string().ok_or_else(|| "no redirect URL".to_string())),
        }
    }
}

pub mod notifications {
    use super::*;

    pub fn create(id: &str, opts: &JsValue) {
        chrome_notifications_create(id, opts);
    }
    pub fn clear(id: &str) {
        chrome_notifications_clear(id);
    }
}

pub mod downloads {
    use super::*;

    /// `chrome.downloads.download(opts)` resolving to the download id.
    pub async fn download(opts: &JsValue) -> JsResult {
        promisify(|cb| chrome_downloads_download(opts, cb)).await
    }
}

pub mod alarms {
    use super::*;

    pub fn create(name: &str, info: &JsValue) {
        chrome_alarms_create(name, info);
    }

    /// Register a `chrome.alarms.onAlarm` listener `(alarm)`.
    pub fn on_alarm<F>(handler: F)
    where
        F: Fn(JsValue) + 'static,
    {
        let cb =
            Closure::wrap(Box::new(move |alarm: JsValue| handler(alarm)) as Box<dyn Fn(JsValue)>);
        chrome_alarms_on_alarm_add(cb.as_ref().unchecked_ref());
        cb.forget();
    }
}
