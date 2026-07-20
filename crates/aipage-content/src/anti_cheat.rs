//! Injects `anti_cheat.js` into the page context during exams. Mirrors
//! `content-scripts/anti-cheat-injector.ts`.

use std::cell::Cell;

use wasm_bindgen::prelude::*;
use wasm_bindgen::JsCast;
use web_sys::HtmlScriptElement;

use aipage_bindings::runtime;

thread_local! {
    static INJECTED: Cell<bool> = const { Cell::new(false) };
}

/// Inject the page-context anti-cheat script once.
pub fn inject_anti_anti_cheat() {
    if INJECTED.with(Cell::get) {
        return;
    }
    let doc = web_sys::window().unwrap().document().unwrap();
    let script: HtmlScriptElement = doc.create_element("script").unwrap().unchecked_into();
    script.set_src(&runtime::get_url("anti_cheat.js"));

    // Remove the injected <script> from the DOM once it has executed, mirroring
    // the TS `script.onload = () => script.remove()` (keeps the injection
    // trace-free).
    let s = script.clone();
    let on_load = Closure::once_into_js(move || s.remove());
    script.set_onload(Some(on_load.unchecked_ref()));

    let parent = doc
        .head()
        .map(|h| h.unchecked_into::<web_sys::Node>())
        .unwrap_or_else(|| doc.document_element().unwrap().unchecked_into());
    let _ = parent.append_child(&script);

    INJECTED.with(|c| c.set(true));
}
