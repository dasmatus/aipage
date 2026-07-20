//! AIPage sidebar — the Leptos CSR application that runs inside `sidebar.html`.

mod app;
mod components;
mod icons;
mod state;
mod util;

use leptos::*;
use wasm_bindgen::prelude::*;
use wasm_bindgen::JsCast;

use app::App;

#[wasm_bindgen(start)]
pub fn start() {
    console_error_panic_hook::set_once();
    aipage_bindings::console::log("aipage sidebar wasm loaded");

    let root = web_sys::window()
        .and_then(|w| w.document())
        .and_then(|d| d.get_element_by_id("root"))
        .expect("#root element");
    leptos::mount_to(root.unchecked_into(), || view! { <App/> });
}
