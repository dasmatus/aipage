//! Small DOM helpers. Mirrors `content-scripts/utils.ts`.

use web_sys::HtmlElement;

const NAVBAR_ID: &str = "edubar";
const TEST_PLAYER_HEADER: &str = ".etest-player-header";

fn document() -> web_sys::Document {
    web_sys::window().unwrap().document().unwrap()
}

/// Height of the EduPage navbar / exam header, defaulting to 43px.
pub fn navbar_height() -> i32 {
    let doc = document();
    if let Some(h) = doc
        .query_selector(TEST_PLAYER_HEADER)
        .ok()
        .flatten()
        .and_then(|e| e.dyn_into::<HtmlElement>().ok())
    {
        if h.offset_height() > 0 {
            return h.offset_height();
        }
    }
    if let Some(nav) = doc.get_element_by_id(NAVBAR_ID).and_then(|e| e.dyn_into::<HtmlElement>().ok()) {
        if nav.offset_height() > 0 {
            return nav.offset_height();
        }
    }
    43
}

use wasm_bindgen::JsCast;

/// Initials read from the profile box, or empty string if absent.
pub fn user_initials() -> String {
    document()
        .get_element_by_id("edubarProfileBox")
        .and_then(|e| e.dyn_into::<HtmlElement>().ok())
        .map(|el| compute_initials(&el.inner_text()))
        .unwrap_or_default()
}

/// First letters of the first two words, uppercased. Pure for testability.
pub fn compute_initials(name: &str) -> String {
    name.split_whitespace()
        .filter(|w| !w.is_empty())
        .filter_map(|w| w.chars().next())
        .take(2)
        .flat_map(|c| c.to_uppercase())
        .collect()
}

#[cfg(test)]
mod tests {
    use super::compute_initials;

    #[test]
    fn computes_initials() {
        assert_eq!(compute_initials("  Jozef   Mrkva "), "JM");
        assert_eq!(compute_initials("Single"), "S");
        assert_eq!(compute_initials("a b c d"), "AB");
        assert_eq!(compute_initials(""), "");
    }
}
