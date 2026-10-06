//! Privileged end of the hosted-UI bridge (see `aipage_bindings::bridge` for
//! the protocol). Lives in the content script, next to the sidebar iframe.
//!
//! Security model: a `hello` is accepted only when `event.origin` is exactly
//! the configured hosted-UI origin **and** `event.source` is the sidebar
//! iframe's `contentWindow`. The reply (`connect`, carrying a `MessagePort`)
//! is posted with that origin as `targetOrigin`, so it cannot reach any other
//! document. Every request is answered by one of the whitelisted handlers;
//! `tabs.query` / `tabs.sendMessage` never touch the privileged
//! `chrome.tabs` API at all — they are served from this tab, which is the
//! only tab the sidebar may target. The Sign-in-with-ChatGPT calls
//! (`identity.*`, `tabs.create`) need APIs a content script does not have,
//! so they are relayed to the background as fixed `runtime.sendMessage`
//! actions with only the URL taken from the request.

use std::cell::{Cell, RefCell};
use std::rc::Rc;

use js_sys::{Array, Object};
use serde_json::{json, Value};
use wasm_bindgen::prelude::*;
use wasm_bindgen::JsCast;
use web_sys::{HtmlIFrameElement, MessageChannel, MessageEvent, MessagePort};

use aipage_bindings::bridge::{parse_frame, parse_handshake, Frame, Handshake, HandshakeKind, Method, EVENT_STORAGE_CHANGED};
use aipage_bindings::{from_js, runtime, storage, to_js};
use aipage_core::remote_ui;

/// Synchronous handler for messages the sidebar would otherwise send to this
/// tab via `chrome.tabs.sendMessage` (page scraping, exam tools, toggle).
pub type LocalDispatch = Rc<dyn Fn(JsValue) -> JsValue>;

/// Pseudo tab id reported to the sidebar by `tabs.query`. Any id is accepted
/// by `tabs.sendMessage` since there is exactly one reachable tab.
const BRIDGE_TAB_ID: i32 = -1;

thread_local! {
    /// The port of the current (latest) connection; replaced on re-connect.
    static ACTIVE_PORT: RefCell<Option<MessagePort>> = const { RefCell::new(None) };
    static CHANGE_FORWARDER_INSTALLED: Cell<bool> = const { Cell::new(false) };
}

/// Listen for the sidebar's `hello` and answer it with a private channel.
///
/// `on_connected` is invoked after the channel is handed over (used to cancel
/// the bundled-sidebar fallback timer).
pub fn install(
    iframe: &HtmlIFrameElement,
    remote_base_url: &str,
    dispatch: LocalDispatch,
    on_connected: Rc<dyn Fn()>,
) {
    let Some(window) = web_sys::window() else { return };
    let expected_base = remote_base_url.to_string();
    let Some(target_origin) = remote_ui::origin_of(&expected_base) else { return };
    let iframe = iframe.clone();

    let on_message = Closure::wrap(Box::new(move |ev: MessageEvent| {
        if !remote_ui::is_expected_origin(&ev.origin(), &expected_base) {
            return;
        }
        let frame_window = match iframe.content_window() {
            Some(w) => w,
            None => return,
        };
        let from_our_iframe = ev
            .source()
            .map(|s| Object::is(s.as_ref(), frame_window.as_ref()))
            .unwrap_or(false);
        if !from_our_iframe {
            return;
        }
        let Some(hs) = parse_handshake(&ev.data()) else { return };
        if !hs.is(HandshakeKind::Hello) {
            return;
        }

        let Ok(channel) = MessageChannel::new() else { return };
        let port1 = channel.port1();
        wire_port(&port1, dispatch.clone());
        ACTIVE_PORT.with(|p| *p.borrow_mut() = Some(port1));
        ensure_change_forwarder();

        let connect = to_js(&Handshake::new(HandshakeKind::Connect));
        let transfer = Array::of1(&channel.port2());
        if frame_window
            .post_message_with_transfer(&connect, &target_origin, &transfer)
            .is_ok()
        {
            on_connected();
        }
    }) as Box<dyn Fn(MessageEvent)>);
    let _ = window.add_event_listener_with_callback("message", on_message.as_ref().unchecked_ref());
    on_message.forget();
}

/// Attach the request handler to our end of the channel.
fn wire_port(port: &MessagePort, dispatch: LocalDispatch) {
    let reply_port = port.clone();
    let on_message = Closure::wrap(Box::new(move |ev: MessageEvent| {
        let Some(Frame::Req { id, method, args }) = parse_frame(&ev.data()) else { return };
        let dispatch = dispatch.clone();
        let reply_port = reply_port.clone();
        wasm_bindgen_futures::spawn_local(async move {
            let frame = match handle(method, &args, &dispatch).await {
                Ok(result) => Frame::ok(id, result),
                Err(e) => Frame::err(id, e),
            };
            let _ = reply_port.post_message(&to_js(&frame));
        });
    }) as Box<dyn Fn(MessageEvent)>);
    port.set_onmessage(Some(on_message.as_ref().unchecked_ref()));
    on_message.forget();
}

/// Forward `chrome.storage.onChanged` to whichever port is current.
fn ensure_change_forwarder() {
    if CHANGE_FORWARDER_INSTALLED.with(|c| c.replace(true)) {
        return;
    }
    storage::on_changed(|changes, area| {
        let port = ACTIVE_PORT.with(|p| p.borrow().clone());
        if let Some(port) = port {
            let frame = Frame::Evt {
                event: EVENT_STORAGE_CHANGED.to_string(),
                args: vec![from_js(&changes), from_js(&area)],
            };
            let _ = port.post_message(&to_js(&frame));
        }
    });
}

fn arg(args: &[Value], i: usize) -> JsValue {
    args.get(i).map(to_js).unwrap_or(JsValue::UNDEFINED)
}

fn js_err(e: JsValue) -> String {
    e.as_string().unwrap_or_else(|| format!("{e:?}"))
}

async fn handle(method: Method, args: &[Value], dispatch: &LocalDispatch) -> Result<Value, String> {
    match method {
        Method::RuntimeSendMessage => runtime::send_message(&arg(args, 0)).await.map(|v| from_js(&v)).map_err(js_err),
        Method::StorageLocalGet => storage::local_get(&arg(args, 0)).await.map(|v| from_js(&v)).map_err(js_err),
        Method::StorageLocalSet => storage::local_set(&arg(args, 0)).await.map(|v| from_js(&v)).map_err(js_err),
        // The sidebar only ever asks for "the active tab" to reach the page it
        // lives in; that is this tab.
        Method::TabsQuery => Ok(json!([{ "id": BRIDGE_TAB_ID, "active": true }])),
        Method::TabsSendMessage => Ok(from_js(&dispatch(arg(args, 1)))),
        Method::TabsCreate => {
            let url = args.first().and_then(|p| p.get("url")).and_then(Value::as_str).ok_or("tabs.create: missing url")?;
            background_url_action("tabs_create", url).await.map(|_| Value::Null)
        }
        Method::IdentityGetRedirectUrl => {
            // `null` (not an error) when the browser has no identity API.
            Ok(background_action("identity_get_redirect_url", None).await.unwrap_or(Value::Null))
        }
        Method::IdentityLaunchWebAuthFlow => {
            let url = args.first().and_then(Value::as_str).ok_or("identity.launchWebAuthFlow: missing url")?;
            background_url_action("identity_launch_web_auth_flow", url).await
        }
    }
}

/// `runtime.sendMessage({ action, payload: { url } })` to the background;
/// its `{ ok, url?, error? }` reply mapped to the `url` value.
async fn background_url_action(action: &str, url: &str) -> Result<Value, String> {
    background_action(action, Some(url)).await
}

async fn background_action(action: &str, url: Option<&str>) -> Result<Value, String> {
    let msg = match url {
        Some(u) => json!({ "action": action, "payload": { "url": u } }),
        None => json!({ "action": action }),
    };
    let reply = runtime::send_message(&to_js(&msg)).await.map(|v| from_js(&v)).map_err(js_err)?;
    if reply.get("ok").and_then(Value::as_bool).unwrap_or(false) {
        Ok(reply.get("url").cloned().unwrap_or(Value::Null))
    } else {
        Err(reply.get("error").and_then(Value::as_str).unwrap_or("background request failed").to_string())
    }
}
