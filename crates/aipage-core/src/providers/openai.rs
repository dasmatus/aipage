//! ChatGPT / OpenAI provider: the public OpenAI platform API with an API key.
//!
//! Endpoints live under `https://api.openai.com/v1` (`/chat/completions`,
//! `/models`) and are authenticated with `Authorization: Bearer <key>` (keys
//! from `https://platform.openai.com/api-keys`). This is plain API-key access
//! to the documented public API; there is deliberately no OAuth / "sign in
//! with ChatGPT" flow. OpenAI accepts OpenAI-style function tools, so the
//! agentic chat + native web search loop in [`crate::agent`] works as-is.
//! Chat and model listing are delegated to [`super::openai_compat`] via
//! [`CONFIG`].
//!
//! `GET /v1/models` returns every model on the account, including embeddings,
//! speech, transcription, image, realtime and moderation models that cannot
//! serve `/v1/chat/completions`. [`get_models`] keeps only chat-capable
//! families (see [`is_chat_model`]) so the settings picker stays usable.

use super::openai_compat::{OpenAiCompat, OPENAI};
use super::{ModelInfo, SendOptions};
use crate::types::ProviderType;

/// The static config this module forwards to.
pub const CONFIG: &OpenAiCompat = &OPENAI;

/// Model-id prefixes of the chat-capable families (`gpt-4o`, `gpt-4.1`,
/// `gpt-5*`, `gpt-6*`, `o1`/`o3`/`o4`, `chatgpt-4o-latest`, ...).
const CHAT_PREFIXES: &[&str] = &["gpt-", "chatgpt-", "o1", "o3", "o4"];

/// Substrings that mark a `gpt-*`/`o*` id as a non-chat modality or as a
/// Responses-API-only model: audio / realtime / speech / transcription /
/// image / search-preview variants, legacy completions (`-instruct`), and
/// the `-pro` / deep-research tiers that do not serve `/v1/chat/completions`.
const NON_CHAT_MARKERS: &[&str] = &[
    "audio",
    "realtime",
    "live",
    "transcribe",
    "tts",
    "whisper",
    "image",
    "search-preview",
    "instruct",
    "embedding",
    "moderation",
    "computer-use",
    "deep-research",
    "-pro",
];

/// Whether a `/v1/models` id belongs to a family that serves
/// `/v1/chat/completions`. Prefix-based: anything outside the `gpt-*`,
/// `chatgpt-*` and `o1`/`o3`/`o4` families (embeddings, `tts-1`, `whisper-1`,
/// `dall-e-*`, `babbage-002`, `sora-*`, ...) is rejected, and within those
/// families the non-chat modality variants are filtered out too.
pub fn is_chat_model(id: &str) -> bool {
    CHAT_PREFIXES.iter().any(|p| id.starts_with(p)) && !NON_CHAT_MARKERS.iter().any(|m| id.contains(m))
}

/// Keep only chat-capable models, sorted by id so the picker is stable
/// (OpenAI returns the list in no particular order).
pub fn filter_chat_models(models: Vec<ModelInfo>) -> Vec<ModelInfo> {
    let mut models: Vec<ModelInfo> = models.into_iter().filter(|m| is_chat_model(&m.id)).collect();
    models.sort_by(|a, b| a.id.cmp(&b.id));
    models
}

pub async fn send_message(prompt: &str, api_key: &str, opts: &SendOptions) -> Result<String, String> {
    CONFIG.send_message(prompt, api_key, opts).await
}

/// `GET /v1/models` narrowed to chat-capable families.
pub async fn get_models(api_key: &str, opts: &SendOptions) -> Vec<ModelInfo> {
    filter_chat_models(CONFIG.get_models(api_key, opts).await)
}

/// Native web search via the shared tool-calling loop (see
/// [`super::ollama_cloud::web_search`]).
pub async fn web_search(query: &str, api_key: &str, opts: &SendOptions) -> Result<String, String> {
    crate::agent::web_search(ProviderType::OpenAi, api_key, query, opts).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn accepts_base_url_with_or_without_v1() {
        let with_v1 = SendOptions { base_url: Some("https://api.openai.com/v1".into()), model_name: None };
        let with_v1_slash = SendOptions { base_url: Some("https://api.openai.com/v1/".into()), model_name: None };
        let without = SendOptions { base_url: Some("https://api.openai.com".into()), model_name: None };
        let expected = "https://api.openai.com/v1/chat/completions";
        assert_eq!(CONFIG.chat_url(&with_v1), expected);
        assert_eq!(CONFIG.chat_url(&with_v1_slash), expected);
        assert_eq!(CONFIG.chat_url(&without), expected);
        assert_eq!(CONFIG.chat_url(&SendOptions::default()), expected);
        assert_eq!(CONFIG.models_url(&SendOptions::default()), "https://api.openai.com/v1/models");
    }

    #[test]
    fn default_model_and_label() {
        assert_eq!(CONFIG.default_base_url, "https://api.openai.com");
        assert_eq!(CONFIG.model_of(&SendOptions::default()), "gpt-4.1-mini");
        assert_eq!(CONFIG.model_of(&SendOptions::with_model("gpt-4.1")), "gpt-4.1");
        assert_eq!(CONFIG.label, "ChatGPT / OpenAI");
        assert!(is_chat_model(CONFIG.default_model), "default model must pass the chat filter");
    }

    #[test]
    fn sends_bearer_and_no_extra_headers() {
        let h = CONFIG.headers("sk-proj-abc");
        assert_eq!(h.get("Authorization").map(String::as_str), Some("Bearer sk-proj-abc"));
        assert_eq!(h.get("Content-Type").map(String::as_str), Some("application/json"));
        assert_eq!(h.len(), 2);
        assert!(CONFIG.extra_headers.is_empty());
    }

    #[test]
    fn chat_families_are_accepted() {
        for id in [
            "gpt-4.1-mini",
            "gpt-4.1",
            "gpt-4.1-nano-2025-04-14",
            "gpt-4o",
            "gpt-4o-mini",
            "gpt-5",
            "gpt-5-mini",
            "gpt-5-nano",
            "gpt-5.6-terra",
            "gpt-6-luna",
            "gpt-6.1-sol",
            "o1",
            "o3",
            "o3-mini",
            "o4-mini",
            "chatgpt-4o-latest",
            "gpt-3.5-turbo",
        ] {
            assert!(is_chat_model(id), "{id} should be listed");
        }
    }

    #[test]
    fn non_chat_models_are_rejected() {
        for id in [
            "text-embedding-3-small",
            "text-embedding-ada-002",
            "tts-1",
            "tts-1-hd",
            "whisper-1",
            "dall-e-3",
            "gpt-image-1",
            "gpt-image-2.5-sunburst",
            "omni-moderation-latest",
            "babbage-002",
            "davinci-002",
            "sora-2",
            "gpt-4o-mini-tts",
            "gpt-4o-transcribe",
            "gpt-4o-mini-transcribe",
            "gpt-4o-audio-preview",
            "gpt-4o-realtime-preview",
            "gpt-realtime-2.1",
            "gpt-live-1",
            "gpt-live-transcribe",
            "gpt-4o-search-preview",
            "gpt-3.5-turbo-instruct",
            "computer-use-preview",
            "o1-pro",
            "o3-pro-2025-06-10",
            "gpt-5-pro",
            "o3-deep-research",
            "codex-mini-latest",
            "",
        ] {
            assert!(!is_chat_model(id), "{id} should be hidden");
        }
    }

    #[test]
    fn get_models_filter_keeps_chat_models_sorted() {
        let data = json!({ "object": "list", "data": [
            { "id": "whisper-1", "object": "model", "owned_by": "openai" },
            { "id": "gpt-4o-mini", "object": "model", "owned_by": "openai" },
            { "id": "text-embedding-3-large", "object": "model", "owned_by": "openai" },
            { "id": "gpt-4.1-mini", "object": "model", "owned_by": "openai" },
            { "id": "o3-mini", "object": "model", "owned_by": "openai" },
            { "name": "no-id" }
        ] });
        let models = filter_chat_models(CONFIG.models_from(&data));
        let ids: Vec<&str> = models.iter().map(|m| m.id.as_str()).collect();
        assert_eq!(ids, vec!["gpt-4.1-mini", "gpt-4o-mini", "o3-mini"]);
        assert!(models.iter().all(|m| m.provider == "ChatGPT / OpenAI"));
        assert!(filter_chat_models(Vec::new()).is_empty());
    }
}
