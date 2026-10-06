//! LM Studio provider (OpenAI-compatible REST API). Mirrors `lmstudio.ts`.
//!
//! Chat goes through the shared [`super::openai_compat`] client via
//! [`CONFIG`]. Model listing keeps one TS-parity quirk: `getModels` only
//! stripped a trailing `/v1` and did *not* coerce `ws://` → `http://`, so the
//! models URL is derived here rather than by [`OpenAiCompat::models_url`].

use super::openai_compat::{OpenAiCompat, LMSTUDIO};
use super::{ModelInfo, SendOptions};

/// The static config this module forwards to.
pub const CONFIG: &OpenAiCompat = &LMSTUDIO;

/// Base URL for `getModels`: the TS `getModels` only strips a trailing `/v1`
/// (no ws→http coercion), unlike `sendMessage`. Mirror that exactly.
fn models_base_url(opts: &SendOptions) -> String {
    let raw = opts.base_url.as_deref().unwrap_or("");
    let mut base = if raw.is_empty() { CONFIG.default_base_url.to_string() } else { raw.to_string() };
    if let Some(stripped) = base.strip_suffix("/v1") {
        base = stripped.to_string();
    }
    base
}

pub async fn send_message(prompt: &str, _api_key: &str, opts: &SendOptions) -> Result<String, String> {
    CONFIG.send_message(prompt, "", opts).await
}

pub async fn get_models(opts: &SendOptions) -> Vec<ModelInfo> {
    let url = format!("{}/v1/models", models_base_url(opts));
    CONFIG.fetch_models(&url, "").await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_base_urls() {
        assert_eq!(CONFIG.normalize_base_url(""), "http://localhost:1234");
        assert_eq!(CONFIG.normalize_base_url("ws://localhost:1234"), "http://localhost:1234");
        assert_eq!(CONFIG.normalize_base_url("wss://host:9"), "https://host:9");
        assert_eq!(CONFIG.normalize_base_url("http://x:1/v1"), "http://x:1");
        assert_eq!(CONFIG.normalize_base_url("http://x:1"), "http://x:1");
    }

    #[test]
    fn models_base_url_only_strips_v1() {
        // getModels must NOT apply ws→http coercion (TS parity).
        assert_eq!(models_base_url(&SendOptions::default()), "http://localhost:1234");
        let ws = SendOptions { base_url: Some("ws://host:1/v1".into()), model_name: None };
        assert_eq!(models_base_url(&ws), "ws://host:1");
    }

    #[test]
    fn local_requests_carry_no_auth_header() {
        assert!(!CONFIG.headers("").contains_key("Authorization"));
        assert_eq!(CONFIG.model_of(&SendOptions::default()), "local-model");
    }
}
