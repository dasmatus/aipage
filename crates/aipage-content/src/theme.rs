//! Global EduPage theme overrides. Mirrors `content-scripts/theme-manager.ts`.

use wasm_bindgen::JsCast;
use web_sys::HtmlStyleElement;

struct ThemeColors {
    accent: &'static str,
    text: &'static str,
    bg: &'static str,
    header: &'static str,
    header_text: &'static str,
    border: &'static str,
}

fn colors_for(theme: &str) -> ThemeColors {
    match theme {
        "sms" => ThemeColors { accent: "#007aff", text: "#000000", bg: "#ffffff", header: "#f9f9f9", header_text: "#000000", border: "#e5e5ea" },
        "gradient" => ThemeColors { accent: "#f81ce5", text: "#ffffff", bg: "#000000", header: "#111111", header_text: "#ffffff", border: "#333333" },
        "discord" => ThemeColors { accent: "#5865f2", text: "#ffffff", bg: "#313338", header: "#2b2d31", header_text: "#dbdee1", border: "#1e1f22" },
        "tokyo" => ThemeColors { accent: "#7aa2f7", text: "#ffffff", bg: "#1a1b26", header: "#24283b", header_text: "#c0caf5", border: "#15161e" },
        "mono" => ThemeColors { accent: "#000000", text: "#000000", bg: "#ffffff", header: "#ffffff", header_text: "#000000", border: "#000000" },
        // "default" and anything unknown.
        _ => ThemeColors { accent: "#2e7d32", text: "#000000", bg: "#f4f6f8", header: "#356da5", header_text: "#ffffff", border: "#e0e0e0" },
    }
}

const STYLE_ID: &str = "edupage-ai-overrides";

fn document() -> web_sys::Document {
    web_sys::window().unwrap().document().unwrap()
}

/// Apply (or, when disabled, remove) the global EduPage colour overrides.
pub fn apply_global_overrides(theme: &str, enabled: bool) {
    let doc = document();

    if !enabled {
        if let Some(style) = doc.get_element_by_id(STYLE_ID) {
            style.remove();
        }
        return;
    }

    let style = match doc.get_element_by_id(STYLE_ID).and_then(|e| e.dyn_into::<HtmlStyleElement>().ok()) {
        Some(s) => s,
        None => {
            let s = doc.create_element("style").unwrap();
            s.set_id(STYLE_ID);
            if let Some(head) = doc.head() {
                let _ = head.append_child(&s);
            }
            s.dyn_into::<HtmlStyleElement>().unwrap()
        }
    };

    style.set_text_content(Some(&build_css(theme)));
}

fn build_css(theme: &str) -> String {
    let c = colors_for(theme);
    let is_dark = matches!(theme, "gradient" | "discord" | "tokyo");

    let dark_block = if is_dark {
        r#"
            body, #docbody, .standardBody, .edubarMainNoSkin, .etest-player {
                background-color: var(--eduba-bg) !important;
                color: var(--eduba-body-text) !important;
            }
            .edubarSidemenu, .edubarSidemenu2 {
                background-color: var(--eduba-header) !important;
                border-right: 1px solid var(--eduba-border) !important;
            }
            .edubarMenuitem, .edubarMenuitem a, .edubarMenuitem span {
                color: var(--eduba-body-text) !important;
            }
            .etest-player-content, .etest-screen-inner {
                background-color: var(--eduba-bg) !important;
            }
            .testme-card, .etest-answer-input-field, .etest-text {
                background-color: var(--eduba-header) !important;
                color: var(--eduba-body-text) !important;
                border-color: var(--eduba-border) !important;
            }
        "#.to_string()
    } else {
        String::new()
    };

    format!(
        r#"
        :root {{
            --eduba-accent: {accent};
            --eduba-bg: {bg};
            --eduba-header: {header};
            --eduba-header-text: {header_text};
            --eduba-body-text: {text};
            --eduba-border: {border};
        }}

        #edubarHeader, .edubarHeader,
        #edubarHeader, .edubarHeader, .edubarHeaderInner,
        .etest-player-header, .etest-player-header-inner {{
            background: var(--eduba-header) !important;
            color: var(--eduba-header-text) !important;
        }}
        #edubarHeader, .etest-player-header {{
            border-bottom: 1px solid var(--eduba-border) !important;
        }}

        .edubarChatBtn, .etest-action-button, .edubarSmartLink, .ebicon {{
            color: var(--eduba-header-text) !important;
        }}
        .edubarChatBtn:hover, .etest-action-button:hover, .edubarSmartLink:hover {{
            background-color: rgba(127,127,127, 0.1) !important;
        }}

        {dark_block}

        .title, span.title {{
            color: var(--eduba-body-text) !important;
        }}

        #edubar-ai-btn {{
            transition: transform 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275);
            color: var(--eduba-header-text) !important;
            z-index: 2147483650 !important;
            position: relative !important;
        }}
        #edubar-ai-btn:hover {{
            transform: scale(1.1);
            color: var(--eduba-accent) !important;
        }}

        ::selection {{ background-color: {accent} !important; color: {text} !important; }}

        .etest-player-header {{
            width: 100vw !important;
            right: 0 !important;
            left: 0 !important;
            max-width: none !important;
            z-index: 2147483648 !important;
        }}
    "#,
        accent = c.accent,
        bg = c.bg,
        header = c.header,
        header_text = c.header_text,
        text = c.text,
        border = c.border,
        dark_block = dark_block,
    )
}
