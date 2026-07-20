//! AIPage content script. Mirrors `src/content.ts`.
//!
//! Injects the AI button into the EduPage navbar / exam header, manages the
//! sidebar iframe via [`SidebarController`], applies global theming, handles
//! exam tools, and injects the anti-cheat bypass.

mod anti_cheat;
mod sidebar_controller;
mod theme;
mod utils;

use std::cell::Cell;
use std::rc::Rc;

use js_sys::{Array, Object, Reflect};
use wasm_bindgen::prelude::*;
use wasm_bindgen::JsCast;
use web_sys::{Element, HtmlElement, MouseEvent, MutationObserver, MutationObserverInit};

use aipage_bindings::{runtime, storage};
use sidebar_controller::SidebarController;

type Controller = Rc<std::cell::RefCell<SidebarController>>;

const AI_BUTTON_SVG: &str = r#"
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
            </svg>
            <p style="margin: 0;">AI</p>
        "#;

fn document() -> web_sys::Document {
    web_sys::window().unwrap().document().unwrap()
}

#[wasm_bindgen(start)]
pub fn start() {
    console_error_panic_hook::set_once();

    let window = web_sys::window().unwrap();

    // Singleton guard + top-frame check.
    let flag = JsValue::from_str("__gemini_sidebar_injected__");
    if Reflect::get(&window, &flag).map(|v| v.is_truthy()).unwrap_or(false) {
        return;
    }
    if let Ok(Some(top)) = window.top() {
        if !Object::is(window.as_ref(), top.as_ref()) {
            return; // running inside a nested frame
        }
    }
    let _ = Reflect::set(&window, &flag, &JsValue::TRUE);

    aipage_bindings::console::log("[AIPage] Content script loaded and active");

    let controller: Controller = Rc::new(std::cell::RefCell::new(SidebarController::new()));
    let anti_cheat_done = Rc::new(Cell::new(false));

    register_message_handler(controller.clone());

    // Run init when the DOM is ready.
    let ctrl = controller.clone();
    let acd = anti_cheat_done.clone();
    if document().ready_state() == "loading" {
        let cb = Closure::once_into_js(move || init(ctrl, acd));
        let _ = document().add_event_listener_with_callback("DOMContentLoaded", cb.unchecked_ref());
    } else {
        init(controller, anti_cheat_done);
    }
}

/// Build the `sync` routine that (re)inserts the AI button. Returned as a
/// reusable closure for the MutationObserver and init.
fn make_sync(controller: Controller, anti_cheat_done: Rc<Cell<bool>>) -> Rc<dyn Fn()> {
    Rc::new(move || {
        let doc = document();
        let quick_menu = doc
            .query_selector(".edubarQuickmenu")
            .ok()
            .flatten()
            .and_then(|e| e.dyn_into::<HtmlElement>().ok());
        let test_menu = doc
            .query_selector(".etest-player-header-inner .etest-header-nav:last-child")
            .ok()
            .flatten()
            .and_then(|e| e.dyn_into::<HtmlElement>().ok());

        let is_test = test_menu.as_ref().map(|m| m.offset_height() > 0).unwrap_or(false);
        let container = match (is_test, &test_menu, &quick_menu) {
            (true, Some(m), _) => m.clone(),
            (_, _, Some(q)) => q.clone(),
            _ => return,
        };

        if is_test && !anti_cheat_done.get() {
            anti_cheat::inject_anti_anti_cheat();
            anti_cheat_done.set(true);
        }

        if container.offset_width() == 0 && container.offset_height() == 0 {
            return;
        }

        let btn_class = if is_test {
            "etest-action-button interactiveElem"
        } else {
            "edubarChatBtn qbutton qbutton-normal tips-bottom"
        };

        if let Some(existing) = doc.get_element_by_id("edubar-ai-btn") {
            let same_parent = existing
                .parent_element()
                .map(|p| Object::is(p.as_ref(), container.as_ref()))
                .unwrap_or(false);
            if same_parent && existing.class_name() == btn_class {
                let first = container.first_child();
                let already_first = first
                    .as_ref()
                    .map(|n| Object::is(n.as_ref(), existing.as_ref()))
                    .unwrap_or(false);
                if !already_first {
                    let _ = container.insert_before(&existing, first.as_ref());
                }
                return;
            }
            existing.remove();
        }

        let btn: HtmlElement = doc.create_element("a").unwrap().unchecked_into();
        btn.set_id("edubar-ai-btn");
        btn.set_class_name(btn_class);
        let style = btn.style();
        for (k, v) in [
            ("cursor", "pointer"),
            ("display", "inline-flex"),
            ("align-items", "center"),
            ("justify-content", "center"),
            ("gap", "6px"),
        ] {
            let _ = style.set_property(k, v);
        }
        let _ = btn.set_attribute("title", "AI Assistant");
        btn.set_inner_html(AI_BUTTON_SVG);

        let _ = container.insert_before(&btn, container.first_child().as_ref());

        let ctrl = controller.clone();
        let cb = Closure::wrap(Box::new(move |e: MouseEvent| {
            e.prevent_default();
            e.stop_propagation();
            ctrl.borrow_mut().toggle();
        }) as Box<dyn Fn(MouseEvent)>);
        let _ = btn.add_event_listener_with_callback("click", cb.as_ref().unchecked_ref());
        cb.forget();

        if controller.borrow().is_open {
            controller.borrow_mut().open();
        }
    })
}

fn init(controller: Controller, anti_cheat_done: Rc<Cell<bool>>) {
    wasm_bindgen_futures::spawn_local(async move {
        aipage_bindings::console::log("[AIPage] Initializing...");

        // Load settings.
        let keys = Array::of3(
            &JsValue::from_str("sidebarWidth"),
            &JsValue::from_str("ai_sidebar_theme"),
            &JsValue::from_str("ai_sidebar_global"),
        );
        let result = storage::local_get(keys.as_ref()).await.unwrap_or(JsValue::UNDEFINED);
        if let Some(w) = Reflect::get(&result, &"sidebarWidth".into()).ok().and_then(|v| v.as_f64()) {
            controller.borrow().set_width(w);
        }
        let global_enabled = Reflect::get(&result, &"ai_sidebar_global".into())
            .map(|v| v.is_truthy())
            .unwrap_or(false);
        let theme = Reflect::get(&result, &"ai_sidebar_theme".into())
            .ok()
            .and_then(|v| v.as_string())
            .unwrap_or_else(|| "default".to_string());

        // Reset stale elements from a previous context.
        controller.borrow_mut().cleanup();
        if let Some(b) = document().get_element_by_id("edubar-ai-btn") {
            b.remove();
        }

        let sync = make_sync(controller.clone(), anti_cheat_done);
        sync();

        // Re-sync on DOM mutations.
        let sync_for_observer = sync.clone();
        let observer_cb = Closure::wrap(Box::new(move |_records: JsValue, _obs: JsValue| {
            sync_for_observer();
        }) as Box<dyn Fn(JsValue, JsValue)>);
        if let Ok(observer) = MutationObserver::new(observer_cb.as_ref().unchecked_ref()) {
            observer_cb.forget();
            let opts = MutationObserverInit::new();
            opts.set_child_list(true);
            opts.set_subtree(true);
            opts.set_attributes(true);
            let filter = Array::of2(&JsValue::from_str("style"), &JsValue::from_str("class"));
            opts.set_attribute_filter(filter.as_ref());
            let _ = observer.observe_with_options(&document().body().unwrap(), &opts);
        }

        theme::apply_global_overrides(&theme, global_enabled);

        // React to theme changes from storage.
        storage::on_changed(move |changes, _area| {
            let touched = Reflect::has(&changes, &"ai_sidebar_theme".into()).unwrap_or(false)
                || Reflect::has(&changes, &"ai_sidebar_global".into()).unwrap_or(false);
            if touched {
                wasm_bindgen_futures::spawn_local(async move {
                    let keys = Array::of2(
                        &JsValue::from_str("ai_sidebar_theme"),
                        &JsValue::from_str("ai_sidebar_global"),
                    );
                    let res = storage::local_get(keys.as_ref()).await.unwrap_or(JsValue::UNDEFINED);
                    let theme = Reflect::get(&res, &"ai_sidebar_theme".into())
                        .ok()
                        .and_then(|v| v.as_string())
                        .unwrap_or_else(|| "default".to_string());
                    let enabled = Reflect::get(&res, &"ai_sidebar_global".into())
                        .map(|v| v.is_truthy())
                        .unwrap_or(false);
                    theme::apply_global_overrides(&theme, enabled);
                });
            }
        });
    });
}

// --- message handlers ---

fn register_message_handler(controller: Controller) {
    runtime::on_message(move |message, _sender| {
        let controller = controller.clone();
        async move {
            let action = Reflect::get(&message, &"action".into())
                .ok()
                .and_then(|v| v.as_string())
                .unwrap_or_default();
            match action.as_str() {
                "toggle_sidebar" => {
                    controller.borrow_mut().toggle();
                    JsValue::NULL
                }
                "get_exam_question" => get_exam_question(),
                "fill_answer" => fill_answer(&message),
                "get_page_content" => get_page_content(),
                _ => JsValue::NULL,
            }
        }
    });
}

/// Build a JS object from `(key, JsValue)` pairs.
fn obj(pairs: &[(&str, JsValue)]) -> JsValue {
    let o = Object::new();
    for (k, v) in pairs {
        let _ = Reflect::set(&o, &JsValue::from_str(k), v);
    }
    o.into()
}

fn get_exam_question() -> JsValue {
    let doc = document();
    let container = doc
        .query_selector(".etest-player-content")
        .ok()
        .flatten()
        .and_then(|e| e.dyn_into::<HtmlElement>().ok());
    let container = match container {
        Some(c) if c.offset_parent().is_some() => c,
        _ => return obj(&[("ok", JsValue::FALSE), ("error", JsValue::from_str("No exam content found"))]),
    };

    let question_text = container.inner_text().trim().to_string();
    let radios = container.query_selector_all("input[type=\"radio\"]").unwrap();
    let has_text_input = container
        .query_selector("input[type=\"text\"], textarea")
        .ok()
        .flatten()
        .is_some();

    let choices = Array::new();
    for i in 0..radios.length() {
        if let Some(node) = radios.item(i) {
            let r: HtmlElement = node.unchecked_into();
            let value = r.get_attribute("value").unwrap_or_default();
            let label = r
                .closest("label")
                .ok()
                .flatten()
                .and_then(|l| l.dyn_into::<HtmlElement>().ok())
                .map(|l| l.inner_text().trim().to_string())
                .filter(|s| !s.is_empty())
                .or_else(|| {
                    r.parent_element()
                        .and_then(|p| p.dyn_into::<HtmlElement>().ok())
                        .map(|p| p.inner_text().trim().to_string())
                })
                .filter(|s| !s.is_empty())
                .unwrap_or_else(|| value.clone());
            choices.push(&obj(&[
                ("value", JsValue::from_str(&value)),
                ("label", JsValue::from_str(&label)),
                ("id", JsValue::from_str(&r.id())),
            ]));
        }
    }

    let input_type = if radios.length() > 0 {
        "choice"
    } else if has_text_input {
        "text"
    } else {
        "unknown"
    };

    obj(&[
        ("ok", JsValue::TRUE),
        ("questionText", JsValue::from_str(&question_text)),
        ("inputType", JsValue::from_str(input_type)),
        ("choices", choices.into()),
    ])
}

fn fill_answer(message: &JsValue) -> JsValue {
    let payload = Reflect::get(message, &"payload".into()).unwrap_or(JsValue::UNDEFINED);
    let input_type = Reflect::get(&payload, &"inputType".into()).ok().and_then(|v| v.as_string()).unwrap_or_default();
    let value = Reflect::get(&payload, &"value".into()).ok().and_then(|v| v.as_string()).unwrap_or_default();
    let doc = document();

    match input_type.as_str() {
        "choice" => {
            let radios = doc.query_selector_all("input[type=\"radio\"]").unwrap();
            for i in 0..radios.length() {
                if let Some(node) = radios.item(i) {
                    let r: HtmlElement = node.unchecked_into();
                    if r.get_attribute("value").as_deref() == Some(value.as_str()) {
                        r.click();
                        return obj(&[("ok", JsValue::TRUE)]);
                    }
                }
            }
            obj(&[("ok", JsValue::FALSE), ("error", JsValue::from_str("Radio option not found"))])
        }
        "text" => {
            let input = doc
                .query_selector(".etest-player-content input[type=\"text\"], .etest-player-content textarea")
                .ok()
                .flatten();
            match input {
                Some(el) => {
                    set_input_value(&el, &value);
                    obj(&[("ok", JsValue::TRUE)])
                }
                None => obj(&[("ok", JsValue::FALSE), ("error", JsValue::from_str("Text input not found"))]),
            }
        }
        _ => obj(&[("ok", JsValue::FALSE), ("error", JsValue::from_str("Unknown input type"))]),
    }
}

fn set_input_value(el: &Element, value: &str) {
    let _ = Reflect::set(el, &"value".into(), &JsValue::from_str(value));
    for ev in ["input", "change"] {
        let init = web_sys::EventInit::new();
        init.set_bubbles(true);
        if let Ok(event) = web_sys::Event::new_with_event_init_dict(ev, &init) {
            let _ = el.dispatch_event(&event);
        }
    }
}

/// Read the current selection's text via its DOM stringifier.
fn selection_text(sel: &web_sys::Selection) -> String {
    Reflect::get(sel.as_ref(), &"toString".into())
        .ok()
        .and_then(|f| f.dyn_into::<js_sys::Function>().ok())
        .and_then(|f| f.call0(sel.as_ref()).ok())
        .and_then(|v| v.as_string())
        .unwrap_or_default()
        .trim()
        .to_string()
}

const REMOVE_SELECTORS: &[&str] = &[
    "#gemini-sidebar-frame",
    "#gemini-sidebar-resizer",
    ".edubar",
    "#edubarHeader",
    "script",
    "style",
    "noscript",
    "iframe",
];

fn get_page_content() -> JsValue {
    let window = web_sys::window().unwrap();
    let doc = window.document().unwrap();

    // Prioritise the selection.
    if let Some(sel) = window.get_selection().ok().flatten() {
        let text = selection_text(&sel);
        if !text.is_empty() {
            return obj(&[("content", JsValue::from_str(&text)), ("isSelection", JsValue::TRUE)]);
        }
    }

    // Prefer exam content, else a cleaned clone of the body.
    let test_content = doc
        .query_selector(".etest-player-content")
        .ok()
        .flatten()
        .and_then(|e| e.dyn_into::<HtmlElement>().ok());

    let mut text = if let Some(tc) = test_content.filter(|tc| tc.offset_parent().is_some()) {
        tc.inner_text()
    } else {
        match doc.body() {
            Some(body) => {
                let clone: HtmlElement = body.clone_node_with_deep(true).unwrap().unchecked_into();
                for sel in REMOVE_SELECTORS {
                    if let Ok(list) = clone.query_selector_all(sel) {
                        for i in 0..list.length() {
                            if let Some(node) = list.item(i) {
                                if let Ok(el) = node.dyn_into::<Element>() {
                                    el.remove();
                                }
                            }
                        }
                    }
                }
                clone.inner_text()
            }
            None => String::new(),
        }
    };

    // Collapse whitespace and cap length.
    text = text.split_whitespace().collect::<Vec<_>>().join(" ");
    if text.chars().count() > 15000 {
        text = text.chars().take(15000).collect();
    }

    obj(&[("content", JsValue::from_str(&text)), ("isSelection", JsValue::FALSE)])
}
