//! Hosted ("remote") sidebar UI: constants and pure URL helpers.
//!
//! The sidebar UI can be served from a web origin (Vercel) instead of the
//! extension bundle so that UI updates ship without reinstalling the
//! extension. The content script decides which URL to load into the sidebar
//! iframe; the remotely hosted page talks to the extension through the
//! postMessage bridge in `aipage_bindings::bridge`.
//!
//! Everything in this module is pure so it can be unit-tested natively.

/// Default production URL of the hosted sidebar (Vercel project `aipage`).
///
/// This is the single place to update if the production domain changes. It
/// can be overridden per install via the [`KEY_REMOTE_UI_URL`] storage key.
pub const DEFAULT_REMOTE_UI_URL: &str = "https://aipage-sooty.vercel.app";

/// `storage.local` key: `bool`, whether the auto-updating hosted UI is used.
/// Absent means **enabled** (the default).
pub const KEY_REMOTE_UI_ENABLED: &str = "remote_ui_enabled";

/// `storage.local` key: optional `String` override of the hosted UI base URL
/// (advanced). Empty/absent means [`DEFAULT_REMOTE_UI_URL`].
pub const KEY_REMOTE_UI_URL: &str = "remote_ui_url";

/// How long the content script waits for the hosted page to connect through
/// the bridge before it falls back to the bundled sidebar.
pub const REMOTE_UI_LOAD_TIMEOUT_MS: i32 = 8_000;

/// Name of the sidebar document, both in the bundle and on the host.
pub const SIDEBAR_PAGE: &str = "sidebar.html";

/// Normalise a user-supplied hosted-UI base URL.
///
/// Accepts `https://` origins (plus `http://localhost` / `http://127.0.0.1`
/// for local development), strips whitespace, a trailing `/sidebar.html` and
/// trailing slashes. Returns `None` for anything else (then the caller should
/// use [`DEFAULT_REMOTE_UI_URL`]).
pub fn normalize_remote_ui_url(raw: &str) -> Option<String> {
    let mut s = raw.trim().to_string();
    if s.is_empty() {
        return None;
    }
    let lower = s.to_ascii_lowercase();
    let is_https = lower.starts_with("https://");
    let is_local_http = lower.starts_with("http://localhost") || lower.starts_with("http://127.0.0.1");
    if !(is_https || is_local_http) {
        return None;
    }
    if let Some(stripped) = s.strip_suffix(SIDEBAR_PAGE) {
        s = stripped.to_string();
    }
    let trimmed = s.trim_end_matches('/');
    // Must still have a host after the scheme.
    let host_part = trimmed.split("://").nth(1).unwrap_or("");
    if host_part.is_empty() || host_part.contains(char::is_whitespace) {
        return None;
    }
    Some(trimmed.to_string())
}

/// Resolve the effective hosted-UI base URL from the stored override.
pub fn effective_remote_ui_url(stored_override: Option<&str>) -> String {
    stored_override
        .and_then(normalize_remote_ui_url)
        .unwrap_or_else(|| DEFAULT_REMOTE_UI_URL.to_string())
}

/// Origin (`scheme://host[:port]`) of a URL, as `event.origin` reports it.
pub fn origin_of(url: &str) -> Option<String> {
    let (scheme, rest) = url.trim().split_once("://")?;
    if scheme.is_empty() {
        return None;
    }
    let host = rest.split(['/', '?', '#']).next().unwrap_or("");
    if host.is_empty() {
        return None;
    }
    Some(format!("{}://{}", scheme.to_ascii_lowercase(), host.to_ascii_lowercase()))
}

/// The hash fragment carrying the user's initials, or empty if there are none.
fn initials_fragment(initials: &str) -> String {
    if initials.is_empty() {
        String::new()
    } else {
        format!("#initials={initials}")
    }
}

/// Full URL of the hosted sidebar page, e.g.
/// `https://aipage-sooty.vercel.app/sidebar.html#initials=JM`.
pub fn remote_sidebar_url(base: &str, initials: &str) -> String {
    format!("{}/{}{}", base.trim_end_matches('/'), SIDEBAR_PAGE, initials_fragment(initials))
}

/// Extension-relative path of the bundled sidebar page (to be passed through
/// `runtime.getURL`), e.g. `sidebar.html#initials=JM`.
pub fn bundled_sidebar_path(initials: &str) -> String {
    format!("{SIDEBAR_PAGE}{}", initials_fragment(initials))
}

/// Exact-match origin check used by the content script before it accepts a
/// bridge message from the sidebar iframe. Case-insensitive on the host, no
/// wildcards, no prefix matching.
pub fn is_expected_origin(event_origin: &str, expected_base_url: &str) -> bool {
    match origin_of(expected_base_url) {
        Some(expected) => !event_origin.is_empty() && event_origin.to_ascii_lowercase() == expected,
        None => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_https_urls() {
        assert_eq!(normalize_remote_ui_url("https://aipage-sooty.vercel.app/").as_deref(), Some("https://aipage-sooty.vercel.app"));
        assert_eq!(normalize_remote_ui_url("  https://example.com/sidebar.html ").as_deref(), Some("https://example.com"));
        assert_eq!(normalize_remote_ui_url("https://example.com/ui/").as_deref(), Some("https://example.com/ui"));
        assert_eq!(normalize_remote_ui_url("http://localhost:4174").as_deref(), Some("http://localhost:4174"));
    }

    #[test]
    fn rejects_insecure_or_garbage_urls() {
        assert_eq!(normalize_remote_ui_url(""), None);
        assert_eq!(normalize_remote_ui_url("   "), None);
        assert_eq!(normalize_remote_ui_url("http://example.com"), None);
        assert_eq!(normalize_remote_ui_url("ftp://example.com"), None);
        assert_eq!(normalize_remote_ui_url("javascript:alert(1)"), None);
        assert_eq!(normalize_remote_ui_url("https://"), None);
        assert_eq!(normalize_remote_ui_url("https:///"), None);
    }

    #[test]
    fn effective_url_falls_back_to_default() {
        assert_eq!(effective_remote_ui_url(None), DEFAULT_REMOTE_UI_URL);
        assert_eq!(effective_remote_ui_url(Some("")), DEFAULT_REMOTE_UI_URL);
        assert_eq!(effective_remote_ui_url(Some("http://evil.example")), DEFAULT_REMOTE_UI_URL);
        assert_eq!(effective_remote_ui_url(Some("https://my.host/")), "https://my.host");
    }

    #[test]
    fn builds_sidebar_urls() {
        assert_eq!(remote_sidebar_url("https://h.example", "JM"), "https://h.example/sidebar.html#initials=JM");
        assert_eq!(remote_sidebar_url("https://h.example/", ""), "https://h.example/sidebar.html");
        assert_eq!(bundled_sidebar_path("XY"), "sidebar.html#initials=XY");
        assert_eq!(bundled_sidebar_path(""), "sidebar.html");
    }

    #[test]
    fn computes_origins() {
        assert_eq!(origin_of("https://A.example:8443/x/y?z#h").as_deref(), Some("https://a.example:8443"));
        assert_eq!(origin_of("https://a.example").as_deref(), Some("https://a.example"));
        assert_eq!(origin_of("not a url"), None);
        assert_eq!(origin_of("https://"), None);
    }

    #[test]
    fn origin_check_is_exact() {
        let base = "https://aipage-sooty.vercel.app";
        assert!(is_expected_origin("https://aipage-sooty.vercel.app", base));
        assert!(is_expected_origin("https://AIPAGE-sooty.vercel.app", base));
        assert!(!is_expected_origin("https://aipage-sooty.vercel.app.evil.example", base));
        assert!(!is_expected_origin("https://evil.example", base));
        assert!(!is_expected_origin("null", base));
        assert!(!is_expected_origin("", base));
        assert!(!is_expected_origin("http://aipage-sooty.vercel.app", base));
        assert!(!is_expected_origin("https://x.example", "garbage"));
    }
}
