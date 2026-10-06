//! AIPage sidebar — the Leptos CSR application that runs inside `sidebar.html`.

mod app;
mod components;
mod icons;
mod state;
mod util;

use wasm_bindgen::prelude::*;
use wasm_bindgen::JsCast;

use aipage_bindings::{bridge, Transport};
use app::App;

/// Shown (in place of a silent blank page) when the hosted sidebar cannot
/// reach the extension, e.g. when `sidebar.html` is opened directly in a tab.
const BRIDGE_UNAVAILABLE_TEXT: &str = "AIPage: not connected to the extension. Open the sidebar from an EduPage page with the AIPage extension installed.";

#[wasm_bindgen(start)]
pub fn start() {
    console_error_panic_hook::set_once();
    aipage_bindings::console::log("aipage sidebar wasm loaded");

    let root = web_sys::window()
        .and_then(|w| w.document())
        .and_then(|d| d.get_element_by_id("root"))
        .expect("#root element");

    if aipage_bindings::transport() == Transport::Bridge {
        aipage_bindings::console::log("aipage sidebar: hosted mode (bridge transport)");
        wasm_bindgen_futures::spawn_local(async {
            if !bridge::wait_connected().await {
                show_bridge_banner();
            }
        });
    }

    // The handle unmounts the app when dropped; the sidebar lives for the page.
    leptos::mount::mount_to(root.unchecked_into(), App).forget();
}

fn show_bridge_banner() {
    let Some(doc) = web_sys::window().and_then(|w| w.document()) else { return };
    let Some(body) = doc.body() else { return };
    let Ok(el) = doc.create_element("div") else { return };
    el.set_id("bridge-unavailable");
    let _ = el.set_attribute("role", "alert");
    let _ = el.set_attribute(
        "style",
        "position:fixed;top:0;left:0;right:0;z-index:2147483647;padding:10px 14px;background:#b91c1c;color:#fff;font:13px/1.4 system-ui,sans-serif;",
    );
    el.set_text_content(Some(BRIDGE_UNAVAILABLE_TEXT));
    let _ = body.prepend_with_node_1(&el);
}
