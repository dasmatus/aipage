//! LM Studio provider (OpenAI-compatible local inference server).
//!
//! Chat goes through the shared [`super::openai_compat`] client via
//! [`CONFIG`]. Model listing derives its URL here: only a trailing `/v1` is
//! stripped, with no `ws://` → `http://` coercion, which differs from
//! [`OpenAiCompat::models_url`] and is kept as-is.

use super::openai_compat::{OpenAiCompat, LMSTUDIO};
use super::{ModelInfo, SendOptions};

/// The static config this module forwards to.
pub const CONFIG: &OpenAiCompat = &LMSTUDIO;

fn models_base_url(opts: &SendOptions) -> String {
    let raw = opts.base_url.as_deref().unwrap_or("");
    let base = if raw.is_empty() { CONFIG.default_base_url } else { raw };
    base.strip_suffix("/v1").unwrap_or(base).to_string()
}

pub async fn get_models(opts: &SendOptions) -> Vec<ModelInfo> {
    let url = format!("{}/v1/models", models_base_url(opts));
    CONFIG.fetch_models(&url, "").await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn models_base_url_only_strips_v1() {
        assert_eq!(models_base_url(&SendOptions::default()), "http://localhost:1234");
        let ws = SendOptions { base_url: Some("ws://host:1/v1".into()), ..SendOptions::default() };
        assert_eq!(models_base_url(&ws), "ws://host:1");
    }

    #[test]
    fn local_requests_carry_no_auth_header() {
        assert!(!CONFIG.headers("").contains_key("Authorization"));
        assert_eq!(CONFIG.model_of(&SendOptions::default()), "local-model");
        assert_eq!(CONFIG.normalize_base_url("ws://localhost:1234/v1"), "http://localhost:1234");
    }
}
