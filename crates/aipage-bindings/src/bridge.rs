//! postMessage bridge used when the sidebar runs on a **web origin** (the
//! hosted, auto-updating UI) and therefore has no `chrome.*` APIs.
//!
//! The sidebar iframe lives in the EduPage DOM, where the extension's content
//! script runs. The content script performs the real extension API calls on
//! the sidebar's behalf and relays the results. The sidebar gets exactly the
//! five APIs the bundled sidebar uses and nothing more.
//!
//! # Protocol (v1)
//!
//! Two phases. The handshake uses `window.postMessage`; everything after it
//! runs over a dedicated [`MessageChannel`] port, so page scripts of the
//! embedding document cannot observe the traffic (the port is transferred
//! into the cross-origin iframe and held by the content script's isolated
//! world).
//!
//! **Handshake** (`window.postMessage`, plain objects):
//!
//! ```text
//! sidebar  → parent : { aipage: "bridge", v: 1, type: "hello" }
//! parent   → sidebar: { aipage: "bridge", v: 1, type: "connect" }   transfer: [MessagePort]
//! ```
//!
//! The content script accepts `hello` only when `event.origin` is the
//! configured hosted-UI origin **and** `event.source` is the sidebar iframe's
//! `contentWindow`; it posts `connect` with `targetOrigin` set to that origin.
//! The sidebar accepts `connect` only from `window.parent` and keeps the first
//! port it receives.
//!
//! **Frames** (over the port; JSON-compatible values only). Every frame has a
//! tag `t`:
//!
//! ```text
//! sidebar → ext : { t: "req", id: <u64>, method: <Method>, args: [...] }
//! ext → sidebar : { t: "res", id: <u64>, ok: true,  result: <any> }
//! ext → sidebar : { t: "res", id: <u64>, ok: false, error: <string> }
//! ext → sidebar : { t: "evt", event: "storage.onChanged", args: [changes, areaName] }
//! ```
//!
//! `method` is one of `runtime.sendMessage`, `storage.local.get`,
//! `storage.local.set`, `tabs.query`, `tabs.sendMessage`; `args` are the
//! positional arguments of the corresponding `chrome.*` call (minus the
//! callback). `tabs.query` / `tabs.sendMessage` are answered by the content
//! script for *its own* tab, which is the only tab the sidebar can ever
//! target.
//!
//! Additive since the Sign-in-with-ChatGPT feature (same `v: 1`, older
//! hosts answer them with an error): `identity.getRedirectURL` (no args →
//! the redirect URL string, or `null` when the browser has no identity
//! API), `identity.launchWebAuthFlow` (`[url]` → the final redirect URL)
//! and `tabs.create` (`[createProperties]`). The content script has none of
//! these APIs itself and relays them to the background.

use std::cell::RefCell;
use std::collections::HashMap;
use std::rc::Rc;

use js_sys::{Function, Object, Promise};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use wasm_bindgen::prelude::*;
use wasm_bindgen::JsCast;
use wasm_bindgen_futures::JsFuture;

use super::{from_js, to_js};

/// Value of the `aipage` discriminator on handshake messages.
pub const PROTOCOL_TAG: &str = "bridge";
/// Protocol version carried in `v`.
pub const PROTOCOL_VERSION: u32 = 1;
/// How long the sidebar waits for `connect` before giving up.
pub const CONNECT_TIMEOUT_MS: i32 = 10_000;

/// Name of the forwarded `chrome.storage.onChanged` event.
pub const EVENT_STORAGE_CHANGED: &str = "storage.onChanged";

/// The extension APIs the bridge exposes, as the `method` string on the wire.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum Method {
    #[serde(rename = "runtime.sendMessage")]
    RuntimeSendMessage,
    #[serde(rename = "storage.local.get")]
    StorageLocalGet,
    #[serde(rename = "storage.local.set")]
    StorageLocalSet,
    #[serde(rename = "tabs.query")]
    TabsQuery,
    #[serde(rename = "tabs.sendMessage")]
    TabsSendMessage,
    #[serde(rename = "tabs.create")]
    TabsCreate,
    #[serde(rename = "identity.getRedirectURL")]
    IdentityGetRedirectUrl,
    #[serde(rename = "identity.launchWebAuthFlow")]
    IdentityLaunchWebAuthFlow,
}

/// `hello` / `connect` handshake envelope (sent via `window.postMessage`).
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Handshake {
    pub aipage: String,
    pub v: u32,
    #[serde(rename = "type")]
    pub kind: HandshakeKind,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum HandshakeKind {
    Hello,
    Connect,
}

impl Handshake {
    pub fn new(kind: HandshakeKind) -> Self {
        Self { aipage: PROTOCOL_TAG.to_string(), v: PROTOCOL_VERSION, kind }
    }

    /// `true` when the envelope is a v1 handshake of the given kind.
    pub fn is(&self, kind: HandshakeKind) -> bool {
        self.aipage == PROTOCOL_TAG && self.v == PROTOCOL_VERSION && self.kind == kind
    }
}

/// A frame exchanged over the bridge port.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(tag = "t", rename_all = "lowercase")]
pub enum Frame {
    Req {
        id: u64,
        method: Method,
        #[serde(default)]
        args: Vec<Value>,
    },
    Res {
        id: u64,
        ok: bool,
        #[serde(default, skip_serializing_if = "Value::is_null")]
        result: Value,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        error: Option<String>,
    },
    Evt {
        event: String,
        #[serde(default)]
        args: Vec<Value>,
    },
}

impl Frame {
    pub fn ok(id: u64, result: Value) -> Self {
        Frame::Res { id, ok: true, result, error: None }
    }
    pub fn err(id: u64, error: impl Into<String>) -> Self {
        Frame::Res { id, ok: false, result: Value::Null, error: Some(error.into()) }
    }
}

/// Parse a handshake envelope out of a `message` event's `data`, if it is one.
pub fn parse_handshake(data: &JsValue) -> Option<Handshake> {
    if !data.is_object() {
        return None;
    }
    serde_wasm_bindgen::from_value::<Handshake>(data.clone()).ok()
}

/// Parse a port frame out of a `message` event's `data`, if it is one.
pub fn parse_frame(data: &JsValue) -> Option<Frame> {
    if !data.is_object() {
        return None;
    }
    serde_wasm_bindgen::from_value::<Frame>(data.clone()).ok()
}

// --- sidebar-side client ---

type ChangeHandler = Rc<dyn Fn(JsValue, JsValue)>;

#[derive(Default)]
struct Client {
    started: bool,
    port: Option<web_sys::MessagePort>,
    /// Terminal failure reason (no parent, timeout).
    failed: Option<String>,
    /// In-flight requests: id → promise resolver (called with the raw frame).
    pending: HashMap<u64, Function>,
    /// Resolvers waiting for the connection outcome (called with a bool).
    waiters: Vec<Function>,
    next_id: u64,
    change_handlers: Vec<ChangeHandler>,
}

thread_local! {
    static CLIENT: RefCell<Client> = RefCell::new(Client::default());
}

fn window() -> web_sys::Window {
    web_sys::window().expect("bridge requires a window")
}

/// Origin to post the `hello` to: the embedding document's origin as reported
/// by `document.referrer`, or `*` when the referrer is unavailable. (The
/// `hello` carries no data; the privileged side verifies *our* origin.)
fn parent_target_origin() -> String {
    window()
        .document()
        .and_then(|d| d.referrer().split_once("://").map(|(s, rest)| {
            let host = rest.split(['/', '?', '#']).next().unwrap_or("");
            format!("{s}://{host}")
        }))
        .filter(|o| !o.ends_with("://"))
        .unwrap_or_else(|| "*".to_string())
}

/// Lazily start the client: install the `message` listener, send `hello`
/// and arm the connect timeout. Safe to call repeatedly.
fn ensure_started() {
    let already = CLIENT.with(|c| {
        let mut c = c.borrow_mut();
        let was = c.started;
        c.started = true;
        was
    });
    if already {
        return;
    }

    let win = window();
    let parent = match win.parent() {
        Ok(Some(p)) if !Object::is(win.as_ref(), p.as_ref()) => p,
        _ => {
            fail("the sidebar is not embedded in an EduPage page (no parent window)");
            return;
        }
    };

    // Accept `connect` from the parent only, keep the first port.
    let parent_for_cb = parent.clone();
    let on_message = Closure::wrap(Box::new(move |ev: web_sys::MessageEvent| {
        let source_is_parent = ev
            .source()
            .map(|s| Object::is(s.as_ref(), parent_for_cb.as_ref()))
            .unwrap_or(false);
        if !source_is_parent {
            return;
        }
        let Some(hs) = parse_handshake(&ev.data()) else { return };
        if !hs.is(HandshakeKind::Connect) {
            return;
        }
        let port = ev.ports().get(0);
        let Ok(port) = port.dyn_into::<web_sys::MessagePort>() else { return };
        adopt_port(port);
    }) as Box<dyn Fn(web_sys::MessageEvent)>);
    let _ = win.add_event_listener_with_callback("message", on_message.as_ref().unchecked_ref());
    on_message.forget();

    // Say hello (retry a few times: the content script's listener is always
    // installed before the iframe, but a slow extension restart is harmless).
    let hello = to_js(&Handshake::new(HandshakeKind::Hello));
    let _ = parent.post_message(&hello, &parent_target_origin());

    // Connect timeout.
    let timeout = Closure::once_into_js(move || {
        let connected = CLIENT.with(|c| c.borrow().port.is_some());
        if !connected {
            fail("the extension did not connect to the hosted sidebar in time");
        }
    });
    let _ = win.set_timeout_with_callback_and_timeout_and_arguments_0(
        timeout.unchecked_ref(),
        CONNECT_TIMEOUT_MS,
    );
}

fn adopt_port(port: web_sys::MessagePort) {
    let already = CLIENT.with(|c| c.borrow().port.is_some());
    if already {
        super::console::warn("[AIPage bridge] ignoring a second connect");
        return;
    }
    let on_port_message = Closure::wrap(Box::new(move |ev: web_sys::MessageEvent| {
        let data = ev.data();
        match parse_frame(&data) {
            Some(Frame::Res { id, .. }) => {
                let resolver = CLIENT.with(|c| c.borrow_mut().pending.remove(&id));
                if let Some(r) = resolver {
                    let _ = r.call1(&JsValue::NULL, &data);
                }
            }
            Some(Frame::Evt { event, args }) if event == EVENT_STORAGE_CHANGED => {
                let handlers: Vec<ChangeHandler> = CLIENT.with(|c| c.borrow().change_handlers.clone());
                let changes = args.first().map(to_js).unwrap_or(JsValue::UNDEFINED);
                let area = args.get(1).map(to_js).unwrap_or(JsValue::UNDEFINED);
                for h in handlers {
                    h(changes.clone(), area.clone());
                }
            }
            _ => {}
        }
    }) as Box<dyn Fn(web_sys::MessageEvent)>);
    port.set_onmessage(Some(on_port_message.as_ref().unchecked_ref()));
    on_port_message.forget();

    let waiters = CLIENT.with(|c| {
        let mut c = c.borrow_mut();
        c.port = Some(port);
        std::mem::take(&mut c.waiters)
    });
    for w in waiters {
        let _ = w.call1(&JsValue::NULL, &JsValue::TRUE);
    }
    super::console::log("[AIPage bridge] connected to the extension");
}

fn fail(reason: &str) {
    let (waiters, pending) = CLIENT.with(|c| {
        let mut c = c.borrow_mut();
        if c.failed.is_none() {
            c.failed = Some(reason.to_string());
        }
        (std::mem::take(&mut c.waiters), std::mem::take(&mut c.pending))
    });
    super::console::error(format!("[AIPage bridge] {reason}"));
    for w in waiters {
        let _ = w.call1(&JsValue::NULL, &JsValue::FALSE);
    }
    let err = to_js(&Frame::err(0, format!("AIPage bridge: {reason}")));
    for (_, r) in pending {
        let _ = r.call1(&JsValue::NULL, &err);
    }
}

/// Resolve to `true` once the bridge is connected, or `false` if it failed.
pub async fn wait_connected() -> bool {
    ensure_started();
    let state = CLIENT.with(|c| {
        let c = c.borrow();
        if c.port.is_some() {
            Some(true)
        } else if c.failed.is_some() {
            Some(false)
        } else {
            None
        }
    });
    if let Some(s) = state {
        return s;
    }
    let promise = Promise::new(&mut |resolve, _reject| {
        CLIENT.with(|c| c.borrow_mut().waiters.push(resolve));
    });
    JsFuture::from(promise).await.map(|v| v.is_truthy()).unwrap_or(false)
}

/// The terminal failure reason, if the bridge gave up.
fn failure() -> Option<String> {
    CLIENT.with(|c| c.borrow().failed.clone())
}

/// Perform one bridged API call. Waits for the connection first; calls made
/// before `connect` arrives are queued, calls after a failure reject at once.
pub async fn call(method: Method, args: &[&JsValue]) -> super::JsResult {
    if !wait_connected().await {
        let reason = failure().unwrap_or_else(|| "not connected".to_string());
        return Err(JsValue::from_str(&format!("AIPage bridge: {reason}")));
    }
    let id = CLIENT.with(|c| {
        let mut c = c.borrow_mut();
        c.next_id += 1;
        c.next_id
    });
    let frame = Frame::Req { id, method, args: args.iter().map(|a| from_js(a)).collect() };
    let promise = Promise::new(&mut |resolve, _reject| {
        CLIENT.with(|c| c.borrow_mut().pending.insert(id, resolve));
    });
    let port = CLIENT.with(|c| c.borrow().port.clone());
    match port {
        Some(p) => {
            if let Err(e) = p.post_message(&to_js(&frame)) {
                CLIENT.with(|c| c.borrow_mut().pending.remove(&id));
                return Err(e);
            }
        }
        None => return Err(JsValue::from_str("AIPage bridge: not connected")),
    }
    let raw = JsFuture::from(promise).await?;
    match parse_frame(&raw) {
        Some(Frame::Res { ok: true, result, .. }) => Ok(to_js(&result)),
        Some(Frame::Res { ok: false, error, .. }) => {
            Err(JsValue::from_str(&error.unwrap_or_else(|| "unknown bridge error".into())))
        }
        _ => Err(JsValue::from_str("AIPage bridge: malformed response")),
    }
}

/// Register a handler for forwarded `storage.onChanged` events.
pub fn on_storage_changed(handler: ChangeHandler) {
    CLIENT.with(|c| c.borrow_mut().change_handlers.push(handler));
    ensure_started();
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn handshake_round_trips_and_validates() {
        let hello = Handshake::new(HandshakeKind::Hello);
        let s = serde_json::to_string(&hello).unwrap();
        assert_eq!(s, r#"{"aipage":"bridge","v":1,"type":"hello"}"#);
        let back: Handshake = serde_json::from_str(&s).unwrap();
        assert!(back.is(HandshakeKind::Hello));
        assert!(!back.is(HandshakeKind::Connect));

        let wrong_version: Handshake = serde_json::from_str(r#"{"aipage":"bridge","v":2,"type":"connect"}"#).unwrap();
        assert!(!wrong_version.is(HandshakeKind::Connect));
        let wrong_tag: Handshake = serde_json::from_str(r#"{"aipage":"other","v":1,"type":"connect"}"#).unwrap();
        assert!(!wrong_tag.is(HandshakeKind::Connect));
        assert!(serde_json::from_str::<Handshake>(r#"{"aipage":"bridge","v":1,"type":"nope"}"#).is_err());
        assert!(serde_json::from_str::<Handshake>(r#""a string""#).is_err());
    }

    #[test]
    fn request_frame_wire_format() {
        let req = Frame::Req {
            id: 7,
            method: Method::StorageLocalGet,
            args: vec![json!(["ai_provider", "language"])],
        };
        let s = serde_json::to_string(&req).unwrap();
        assert_eq!(s, r#"{"t":"req","id":7,"method":"storage.local.get","args":[["ai_provider","language"]]}"#);
        assert_eq!(serde_json::from_str::<Frame>(&s).unwrap(), req);
    }

    #[test]
    fn response_frames_round_trip() {
        let ok = Frame::ok(3, json!({"ai_provider": "ollama"}));
        let s = serde_json::to_string(&ok).unwrap();
        assert_eq!(s, r#"{"t":"res","id":3,"ok":true,"result":{"ai_provider":"ollama"}}"#);
        assert_eq!(serde_json::from_str::<Frame>(&s).unwrap(), ok);

        let err = Frame::err(4, "boom");
        let s = serde_json::to_string(&err).unwrap();
        assert_eq!(s, r#"{"t":"res","id":4,"ok":false,"error":"boom"}"#);
        assert_eq!(serde_json::from_str::<Frame>(&s).unwrap(), err);

        // A null result is omitted on the wire and defaults back to null.
        let null_ok = Frame::ok(5, Value::Null);
        assert_eq!(serde_json::to_string(&null_ok).unwrap(), r#"{"t":"res","id":5,"ok":true}"#);
        assert_eq!(serde_json::from_str::<Frame>(r#"{"t":"res","id":5,"ok":true}"#).unwrap(), null_ok);
    }

    #[test]
    fn event_frame_round_trips() {
        let evt = Frame::Evt {
            event: EVENT_STORAGE_CHANGED.into(),
            args: vec![json!({"language": {"newValue": "en"}}), json!("local")],
        };
        let s = serde_json::to_string(&evt).unwrap();
        assert_eq!(s, r#"{"t":"evt","event":"storage.onChanged","args":[{"language":{"newValue":"en"}},"local"]}"#);
        assert_eq!(serde_json::from_str::<Frame>(&s).unwrap(), evt);
    }

    #[test]
    fn unknown_methods_and_tags_are_rejected() {
        assert!(serde_json::from_str::<Frame>(r#"{"t":"req","id":1,"method":"tabs.remove","args":[]}"#).is_err());
        assert!(serde_json::from_str::<Frame>(r#"{"t":"req","id":1,"method":"runtime.getURL","args":[]}"#).is_err());
        assert!(serde_json::from_str::<Frame>(r#"{"t":"req","id":1,"method":"identity.getAuthToken","args":[]}"#).is_err());
        assert!(serde_json::from_str::<Frame>(r#"{"t":"zzz","id":1}"#).is_err());
        assert!(serde_json::from_str::<Frame>(r#"{"id":1,"ok":true}"#).is_err());
    }

    #[test]
    fn every_method_has_a_stable_wire_name() {
        let names: Vec<String> = [
            Method::RuntimeSendMessage,
            Method::StorageLocalGet,
            Method::StorageLocalSet,
            Method::TabsQuery,
            Method::TabsSendMessage,
            Method::TabsCreate,
            Method::IdentityGetRedirectUrl,
            Method::IdentityLaunchWebAuthFlow,
        ]
        .iter()
        .map(|m| serde_json::to_string(m).unwrap())
        .collect();
        assert_eq!(
            names,
            [
                "\"runtime.sendMessage\"",
                "\"storage.local.get\"",
                "\"storage.local.set\"",
                "\"tabs.query\"",
                "\"tabs.sendMessage\"",
                "\"tabs.create\"",
                "\"identity.getRedirectURL\"",
                "\"identity.launchWebAuthFlow\"",
            ]
        );
    }
}
