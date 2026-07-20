//! Markdown → HTML rendering. Replaces the `marked` dependency.
//!
//! Used by the chat message list to render AI responses. Output is inserted via
//! Leptos `inner_html`, matching the old `dangerouslySetInnerHTML` behaviour.

use pulldown_cmark::{html, Options, Parser};

/// Render a markdown string to an HTML fragment.
pub fn render(markdown: &str) -> String {
    let mut options = Options::empty();
    options.insert(Options::ENABLE_STRIKETHROUGH);
    options.insert(Options::ENABLE_TABLES);
    options.insert(Options::ENABLE_TASKLISTS);
    let parser = Parser::new_ext(markdown, options);
    let mut out = String::new();
    html::push_html(&mut out, parser);
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn renders_basic_markdown() {
        let html = render("# Title\n\nSome **bold** and `code`.");
        assert!(html.contains("<h1>Title</h1>"));
        assert!(html.contains("<strong>bold</strong>"));
        assert!(html.contains("<code>code</code>"));
    }

    #[test]
    fn renders_lists_and_links() {
        let html = render("- one\n- two\n\n[link](https://example.com)");
        assert!(html.contains("<ul>"));
        assert!(html.contains("<li>one</li>"));
        assert!(html.contains("href=\"https://example.com\""));
    }
}
