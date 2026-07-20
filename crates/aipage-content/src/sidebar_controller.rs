//! Manages the sidebar iframe and its drag-to-resize handle. Mirrors
//! `content-scripts/sidebar-controller.ts`.

use std::cell::{Cell, RefCell};
use std::rc::Rc;

use wasm_bindgen::prelude::*;
use wasm_bindgen::JsCast;
use web_sys::{HtmlDivElement, HtmlElement, HtmlIFrameElement, MouseEvent};

use aipage_bindings::{runtime, storage};

use crate::utils;

const MIN_WIDTH: f64 = 250.0;
const MAX_WIDTH: f64 = 450.0;
const OPEN_TRANSITION: &str = "right 0.3s cubic-bezier(0.16, 1, 0.3, 1)";

pub struct SidebarController {
    pub is_open: bool,
    width: Rc<Cell<f64>>,
    is_resizing: Rc<Cell<bool>>,
    iframe: Option<HtmlIFrameElement>,
    resizer: Option<HtmlDivElement>,
}

fn document() -> web_sys::Document {
    web_sys::window().unwrap().document().unwrap()
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
        }
    }

    pub fn set_width(&self, w: f64) {
        self.width.set(w);
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
        let mut src = runtime::get_url("sidebar.html");
        if !initials.is_empty() {
            src.push_str(&format!("#initials={initials}"));
        }
        iframe.set_src(&src);
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

fn save_width(width: f64) {
    let obj = js_sys::Object::new();
    let _ = js_sys::Reflect::set(&obj, &"sidebarWidth".into(), &JsValue::from_f64(width));
    wasm_bindgen_futures::spawn_local(async move {
        let _ = storage::local_set(obj.as_ref()).await;
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
