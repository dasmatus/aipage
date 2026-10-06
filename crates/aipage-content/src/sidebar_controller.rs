//! Manages the sidebar iframe and its drag-to-resize handle.
//!
//! The iframe loads either the **hosted** sidebar (remote UI, default) or the
//! **bundled** one. With the hosted UI the controller arms a fallback: if the
//! hosted page has not connected through the bridge within
//! [`remote_ui::REMOTE_UI_LOAD_TIMEOUT_MS`] (offline, blocked by CSP, host
//! down, WASM failed to boot…) or the frame errors, the iframe is pointed at
//! the bundled sidebar so the user is never left with an empty panel.

use std::cell::{Cell, RefCell};
use std::rc::Rc;

use wasm_bindgen::prelude::*;
use wasm_bindgen::JsCast;
use web_sys::{HtmlDivElement, HtmlElement, HtmlIFrameElement, MouseEvent};

use aipage_bindings::{runtime, storage};
use aipage_core::remote_ui;

use crate::bridge::{self, LocalDispatch};
use crate::utils::{self, document};

const MIN_WIDTH: f64 = 250.0;
const MAX_WIDTH: f64 = 450.0;
const OPEN_TRANSITION: &str = "right 0.3s cubic-bezier(0.16, 1, 0.3, 1)";

pub struct SidebarController {
    pub is_open: bool,
    width: Rc<Cell<f64>>,
    is_resizing: Rc<Cell<bool>>,
    iframe: Option<HtmlIFrameElement>,
    resizer: Option<HtmlDivElement>,
    /// Base URL of the hosted UI when the remote UI is enabled.
    remote_ui: Option<String>,
    /// Handles `tabs.sendMessage`-style requests from the hosted sidebar.
    dispatch: Option<LocalDispatch>,
}

fn set_styles(el: &HtmlElement, props: &[(&str, &str)]) {
    let style = el.style();
    for (k, v) in props {
        let _ = style.set_property(k, v);
    }
}

impl SidebarController {
    pub fn new() -> Self {
        Self {
            is_open: false,
            width: Rc::new(Cell::new(320.0)),
            is_resizing: Rc::new(Cell::new(false)),
            iframe: None,
            resizer: None,
            remote_ui: None,
            dispatch: None,
        }
    }

    pub fn set_width(&self, w: f64) {
        self.width.set(w);
    }

    /// `Some(base_url)` to load the hosted UI, `None` for the bundled one.
    pub fn set_remote_ui(&mut self, base_url: Option<String>) {
        self.remote_ui = base_url;
    }

    pub fn set_dispatch(&mut self, dispatch: LocalDispatch) {
        self.dispatch = Some(dispatch);
    }

    /// Re-create the iframe (e.g. after the remote-UI setting changed),
    /// preserving the open/closed state.
    pub fn reload(&mut self) {
        let was_open = self.is_open;
        self.cleanup();
        self.is_open = was_open;
        if was_open {
            self.open();
        }
    }

    pub fn toggle(&mut self) {
        self.is_open = !self.is_open;
        if self.is_open {
            self.open();
        } else {
            self.close();
        }
    }

    pub fn open(&mut self) {
        if self.iframe.is_none() {
            self.create_elements();
        }
        let nav = utils::navbar_height();
        let top = format!("{nav}px");
        let height = format!("calc(100vh - {nav}px)");
        let w = self.width.get();

        if let Some(f) = &self.iframe {
            set_styles(
                f,
                &[
                    ("top", &top),
                    ("height", &height),
                    ("width", &format!("{w}px")),
                    ("right", "0px"),
                    ("display", "block"),
                ],
            );
        }
        if let Some(r) = &self.resizer {
            set_styles(
                r,
                &[
                    ("top", &top),
                    ("height", &height),
                    ("right", &format!("{w}px")),
                    ("display", "block"),
                ],
            );
        }
    }

    pub fn close(&mut self) {
        let w = self.width.get();
        if let Some(f) = &self.iframe {
            let _ = f.style().set_property("right", &format!("-{w}px"));
        }
        if let Some(r) = &self.resizer {
            let _ = r.style().set_property("display", "none");
        }
    }

    pub fn cleanup(&mut self) {
        if let Some(f) = self.iframe.take() {
            f.remove();
        }
        if let Some(r) = self.resizer.take() {
            r.remove();
        }
        self.is_open = false;
    }

    fn create_elements(&mut self) {
        let doc = document();
        if let Some(e) = doc.get_element_by_id("gemini-sidebar-frame") {
            e.remove();
        }
        if let Some(e) = doc.get_element_by_id("gemini-sidebar-resizer") {
            e.remove();
        }

        let w = self.width.get();
        let initials = utils::user_initials();

        // --- iframe ---
        let iframe: HtmlIFrameElement = doc.create_element("iframe").unwrap().unchecked_into();
        iframe.set_id("gemini-sidebar-frame");
        let bundled_src = runtime::get_url(&remote_ui::bundled_sidebar_path(&initials));
        match (&self.remote_ui, &self.dispatch) {
            (Some(base), Some(dispatch)) => {
                arm_remote_with_fallback(&iframe, base, dispatch.clone(), bundled_src);
                iframe.set_src(&remote_ui::remote_sidebar_url(base, &initials));
            }
            _ => iframe.set_src(&bundled_src),
        }
        set_styles(
            iframe.unchecked_ref(),
            &[
                ("position", "fixed"),
                ("right", &format!("-{w}px")),
                ("border", "none"),
                ("z-index", "2147483646"),
                ("box-shadow", "-4px 0 20px rgba(0,0,0,0.1)"),
                ("transition", OPEN_TRANSITION),
                ("background", "#fff"),
            ],
        );

        // --- resizer ---
        let resizer: HtmlDivElement = doc.create_element("div").unwrap().unchecked_into();
        resizer.set_id("gemini-sidebar-resizer");
        set_styles(
            resizer.unchecked_ref(),
            &[
                ("position", "fixed"),
                ("width", "4px"),
                ("cursor", "ew-resize"),
                ("z-index", "2147483647"),
                ("background", "transparent"),
                ("display", "none"),
            ],
        );

        self.wire_resize(&iframe, &resizer);

        let body = doc.body().unwrap();
        let _ = body.append_child(&iframe);
        let _ = body.append_child(&resizer);

        self.iframe = Some(iframe);
        self.resizer = Some(resizer);
    }

    /// Install hover + drag-to-resize handlers. Listeners are persistent and
    /// gated by `is_resizing` (avoids add/remove churn per drag).
    fn wire_resize(&self, iframe: &HtmlIFrameElement, resizer: &HtmlDivElement) {
        let width = self.width.clone();
        let is_resizing = self.is_resizing.clone();
        let start_x = Rc::new(Cell::new(0.0));
        let start_width = Rc::new(Cell::new(0.0));
        let overlay: Rc<RefCell<Option<HtmlElement>>> = Rc::new(RefCell::new(None));

        // Hover highlight.
        {
            let r = resizer.clone();
            on(resizer, "mouseenter", move |_e| {
                let _ = r.style().set_property("background", "rgba(46, 125, 50, 0.3)");
            });
            let r = resizer.clone();
            let resizing = is_resizing.clone();
            on(resizer, "mouseleave", move |_e| {
                if !resizing.get() {
                    let _ = r.style().set_property("background", "transparent");
                }
            });
        }

        // Begin drag.
        {
            let iframe = iframe.clone();
            let resizing = is_resizing.clone();
            let start_x = start_x.clone();
            let start_width = start_width.clone();
            let width = width.clone();
            let overlay = overlay.clone();
            on(resizer, "mousedown", move |e: MouseEvent| {
                resizing.set(true);
                let body = document().body().unwrap();
                set_styles(&body, &[("cursor", "ew-resize"), ("user-select", "none")]);
                let _ = iframe.style().set_property("transition", "none");

                let ov: HtmlElement = document().create_element("div").unwrap().unchecked_into();
                set_styles(
                    &ov,
                    &[
                        ("position", "fixed"),
                        ("top", "0"),
                        ("bottom", "0"),
                        ("left", "0"),
                        ("right", "0"),
                        ("z-index", "2147483648"),
                        ("cursor", "ew-resize"),
                    ],
                );
                let _ = body.append_child(&ov);
                *overlay.borrow_mut() = Some(ov);

                start_x.set(e.client_x() as f64);
                start_width.set(width.get());
            });
        }

        let window = web_sys::window().unwrap();

        // Drag move.
        {
            let iframe = iframe.clone();
            let resizer = resizer.clone();
            let resizing = is_resizing.clone();
            let width = width.clone();
            let start_x = start_x.clone();
            let start_width = start_width.clone();
            on(&window, "mousemove", move |e: MouseEvent| {
                if !resizing.get() {
                    return;
                }
                let delta = start_x.get() - e.client_x() as f64;
                let new_width = (start_width.get() + delta).clamp(MIN_WIDTH, MAX_WIDTH);
                width.set(new_width);
                let _ = iframe.style().set_property("width", &format!("{new_width}px"));
                let _ = resizer.style().set_property("right", &format!("{new_width}px"));
            });
        }

        // End drag.
        {
            let iframe = iframe.clone();
            let resizer = resizer.clone();
            let resizing = is_resizing.clone();
            let width = width.clone();
            let overlay = overlay.clone();
            on(&window, "mouseup", move |_e: MouseEvent| {
                if !resizing.get() {
                    return;
                }
                resizing.set(false);
                let body = document().body().unwrap();
                set_styles(&body, &[("cursor", ""), ("user-select", "")]);
                let _ = iframe.style().set_property("transition", OPEN_TRANSITION);
                if let Some(ov) = overlay.borrow_mut().take() {
                    ov.remove();
                }
                let _ = resizer.style().set_property("background", "transparent");
                save_width(width.get());
            });
        }
    }
}

/// Install the bridge host for the hosted UI and arm the bundled fallback.
/// Must run before `src` is set so no `hello` can be missed.
fn arm_remote_with_fallback(iframe: &HtmlIFrameElement, base: &str, dispatch: LocalDispatch, bundled_src: String) {
    let connected = Rc::new(Cell::new(false));
    let fell_back = Rc::new(Cell::new(false));

    let fallback: Rc<dyn Fn(&str)> = {
        let iframe = iframe.clone();
        let connected = connected.clone();
        let fell_back = fell_back.clone();
        Rc::new(move |reason: &str| {
            if connected.get() || fell_back.replace(true) {
                return;
            }
            aipage_bindings::console::warn(format!(
                "[AIPage] hosted sidebar unavailable ({reason}); using the bundled sidebar"
            ));
            iframe.set_src(&bundled_src);
        })
    };

    // 1. Bridge host: a `hello` from the hosted page cancels the fallback.
    {
        let connected = connected.clone();
        let fell_back = fell_back.clone();
        bridge::install(
            iframe,
            base,
            dispatch,
            Rc::new(move || {
                if !fell_back.get() {
                    connected.set(true);
                }
            }),
        );
    }

    // 2. Frame-level error (rare; most failures render an error page instead).
    {
        let fallback = fallback.clone();
        let cb = Closure::wrap(Box::new(move |_e: web_sys::Event| fallback("frame error")) as Box<dyn Fn(web_sys::Event)>);
        let _ = iframe.add_event_listener_with_callback("error", cb.as_ref().unchecked_ref());
        cb.forget();
    }

    // 3. No connection within the timeout.
    let timeout = Closure::once_into_js(move || fallback("no bridge connection before timeout"));
    if let Some(w) = web_sys::window() {
        let _ = w.set_timeout_with_callback_and_timeout_and_arguments_0(
            timeout.unchecked_ref(),
            remote_ui::REMOTE_UI_LOAD_TIMEOUT_MS,
        );
    }
}

fn save_width(width: f64) {
    let obj = aipage_bindings::js_object(&[("sidebarWidth", JsValue::from_f64(width))]);
    wasm_bindgen_futures::spawn_local(async move {
        let _ = storage::local_set(&obj).await;
    });
}

/// Attach a persistent event listener (leaks the closure for the page lifetime).
fn on<T, F>(target: &T, event: &str, handler: F)
where
    T: AsRef<web_sys::EventTarget>,
    F: Fn(MouseEvent) + 'static,
{
    let cb = Closure::wrap(Box::new(handler) as Box<dyn Fn(MouseEvent)>);
    let _ = target
        .as_ref()
        .add_event_listener_with_callback(event, cb.as_ref().unchecked_ref());
    cb.forget();
}
