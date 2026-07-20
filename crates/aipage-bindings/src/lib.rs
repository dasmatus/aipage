//! Hand-rolled bindings to the WebExtension API surface used by AIPage.
//!
//! Replaces `webextension-polyfill`. We bind to the **callback-based `chrome.*`
//! namespace**, which Chrome, Firefox and Safari all expose, and wrap the
//! callbacks into Rust futures. This gives one uniform, promise-like API across
//! every target without shipping any JavaScript polyfill.

use js_sys::{Function, Object, Promise, Reflect};
use wasm_bindgen::prelude::*;
use wasm_bindgen::JsCast;
use wasm_bindgen_futures::JsFuture;

pub type JsResult = Result<JsValue, JsValue>;

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

    // --- browserAction (MV2) ---
    #[wasm_bindgen(js_namespace = ["chrome", "browserAction", "onClicked"], js_name = addListener)]
    fn chrome_action_on_clicked_add(cb: &Function);

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
        promisify(|cb| chrome_runtime_send_message(msg, cb)).await
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
        promisify(|cb| chrome_storage_local_get(keys, cb)).await
    }

    /// `chrome.storage.local.set(items)` where `items` is an object map.
    pub async fn local_set(items: &JsValue) -> JsResult {
        promisify(|cb| chrome_storage_local_set(items, cb)).await
    }

    /// Register a `chrome.storage.onChanged` listener `(changes, areaName)`.
    pub fn on_changed<F>(handler: F)
    where
        F: Fn(JsValue, JsValue) + 'static,
    {
        let cb = Closure::wrap(Box::new(move |changes: JsValue, area: JsValue| {
            handler(changes, area);
        }) as Box<dyn Fn(JsValue, JsValue)>);
        chrome_storage_on_changed_add(cb.as_ref().unchecked_ref());
        cb.forget();
    }
}

pub mod tabs {
    use super::*;

    /// `chrome.tabs.sendMessage(tabId, msg)` awaited for its response.
    pub async fn send_message(tab_id: i32, msg: &JsValue) -> JsResult {
        promisify(|cb| chrome_tabs_send_message(tab_id, msg, cb)).await
    }

    /// `chrome.tabs.query(queryInfo)` resolving to an array of tab objects.
    pub async fn query(query_info: &JsValue) -> JsResult {
        promisify(|cb| chrome_tabs_query(query_info, cb)).await
    }

    /// Convenience: id of the first tab matching `{active:true,currentWindow:true}`.
    pub async fn active_tab_id() -> Option<i32> {
        let q = Object::new();
        let _ = Reflect::set(&q, &"active".into(), &JsValue::TRUE);
        let _ = Reflect::set(&q, &"currentWindow".into(), &JsValue::TRUE);
        let tabs = query(&q).await.ok()?;
        let first = js_sys::Array::from(&tabs).get(0);
        Reflect::get(&first, &"id".into())
            .ok()
            .and_then(|v| v.as_f64())
            .map(|n| n as i32)
    }
}

pub mod action {
    use super::*;

    /// Register a `chrome.browserAction.onClicked` listener `(tab)`.
    pub fn on_clicked<F>(handler: F)
    where
        F: Fn(JsValue) + 'static,
    {
        let cb = Closure::wrap(Box::new(move |tab: JsValue| handler(tab)) as Box<dyn Fn(JsValue)>);
        chrome_action_on_clicked_add(cb.as_ref().unchecked_ref());
        cb.forget();
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
