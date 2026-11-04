//! The sidebar's session id and client user agent, for backends that ask
//! clients to identify themselves (OpenCode Go wants a stable
//! `x-opencode-session` per conversation and a client-specific user agent).
//!
//! The sidebar sends every message as a fresh one-shot request with no
//! server-side thread, so one sidebar page load is one conversation: the id
//! is generated on first use and reused until the sidebar is reloaded.

use std::cell::OnceCell;

/// `aipage/<version>`, the user agent sent where a backend asks for one.
pub const USER_AGENT: &str = concat!("aipage/", env!("CARGO_PKG_VERSION"));

thread_local! {
    static SESSION_ID: OnceCell<String> = const { OnceCell::new() };
}

/// This sidebar's session id (`aipage-<32 hex digits>`), stable for the
/// lifetime of the page.
pub fn id() -> String {
    SESSION_ID.with(|cell| cell.get_or_init(|| format_id(random_u64(), random_u64())).clone())
}

/// `aipage-` followed by both halves as 16 hex digits each.
pub fn format_id(hi: u64, lo: u64) -> String {
    format!("aipage-{hi:016x}{lo:016x}")
}

#[cfg(target_arch = "wasm32")]
fn random_u64() -> u64 {
    // Two 32-bit draws from Math.random (wasm has no OS RNG without extra
    // crates); this only has to be unique, not secret.
    let draw = || (js_sys::Math::random() * 4_294_967_296.0) as u64;
    (draw() << 32) | draw()
}

#[cfg(not(target_arch = "wasm32"))]
fn random_u64() -> u64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    let nanos = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(0);
    (nanos as u64) ^ ((std::process::id() as u64) << 32)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn id_is_stable_and_well_formed() {
        let a = id();
        assert_eq!(a, id(), "the session id must not change between requests");
        assert!(a.starts_with("aipage-"));
        assert_eq!(a.len(), "aipage-".len() + 32);
        assert!(a["aipage-".len()..].chars().all(|c| c.is_ascii_hexdigit()));
    }

    #[test]
    fn format_pads_both_halves() {
        assert_eq!(format_id(1, 0xabc), "aipage-00000000000000010000000000000abc");
    }

    #[test]
    fn user_agent_names_aipage() {
        assert!(USER_AGENT.starts_with("aipage/"));
        assert!(USER_AGENT.len() > "aipage/".len());
    }
}
