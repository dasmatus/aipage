//! OpenCode Go: the flat-rate OpenCode subscription for open coding models
//! (GLM, Kimi, DeepSeek, MiMo, ...), used with the subscription's API key.
//!
//! Go serves its models under `https://opencode.ai/zen/go/v1` and
//! authenticates with `Authorization: Bearer <key>` (keys from the OpenCode
//! console, `opencode.ai/auth`). Every model is reached over one of three
//! wire formats: OpenAI chat completions (GLM, Kimi, DeepSeek, MiMo, ...),
//! Anthropic messages (MiniMax, Qwen, Claude) or OpenAI responses (GPT).
//! AIPage speaks chat completions, so chat goes through
//! [`super::openai_compat`] via [`CONFIG`]; this module only exists because
//! `GET /v1/models` lists every model on the plan, and [`get_models`] hides
//! the families that do not serve `/v1/chat/completions` (see
//! [`is_chat_completions_model`]) so the settings picker only offers models
//! that work.

use super::openai_compat::{OpenAiCompat, OPENCODE_GO};
use super::{ModelInfo, SendOptions};

/// The static config this module forwards to.
pub const CONFIG: &OpenAiCompat = &OPENCODE_GO;

/// Model-id prefixes of the families Go serves only over the Anthropic
/// messages API (`minimax-*`, `qwen*`, `claude-*`) or the OpenAI responses
/// API (`gpt-*`), not over `/v1/chat/completions`.
const OTHER_PROTOCOL_PREFIXES: &[&str] = &["minimax-", "qwen", "claude-", "gpt-"];

/// Whether a Go model id is served over `/v1/chat/completions`. The plan's
/// model list changes often, so this rejects the known other-protocol
/// families instead of allow-listing today's chat-completions models.
pub fn is_chat_completions_model(id: &str) -> bool {
    !id.is_empty() && !OTHER_PROTOCOL_PREFIXES.iter().any(|p| id.starts_with(p))
}

/// Keep only chat-completions models, sorted by id so the picker is stable.
pub fn filter_chat_models(models: Vec<ModelInfo>) -> Vec<ModelInfo> {
    let mut models: Vec<ModelInfo> =
        models.into_iter().filter(|m| is_chat_completions_model(&m.id)).collect();
    models.sort_by(|a, b| a.id.cmp(&b.id));
    models
}

/// `GET /v1/models` narrowed to chat-completions models.
pub async fn get_models(api_key: &str, opts: &SendOptions) -> Vec<ModelInfo> {
    filter_chat_models(CONFIG.get_models(api_key, opts).await)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn accepts_base_url_with_or_without_v1() {
        let expected = "https://opencode.ai/zen/go/v1/chat/completions";
        for raw in ["", "https://opencode.ai/zen/go", "https://opencode.ai/zen/go/v1", "https://opencode.ai/zen/go/v1/"] {
            let opts = SendOptions { base_url: Some(raw.into()), model_name: None };
            assert_eq!(CONFIG.chat_url(&opts), expected, "{raw}");
        }
        assert_eq!(CONFIG.models_url(&SendOptions::default()), "https://opencode.ai/zen/go/v1/models");
    }

    #[test]
    fn default_model_and_label() {
        assert_eq!(CONFIG.label, "OpenCode Go");
        assert_eq!(CONFIG.model_of(&SendOptions::default()), "deepseek-v4.1-flash");
        assert_eq!(CONFIG.model_of(&SendOptions::with_model("glm-5.1")), "glm-5.1");
        assert!(is_chat_completions_model(CONFIG.default_model), "default model must pass the filter");
    }

    #[test]
    fn sends_bearer_and_no_extra_headers() {
        let h = CONFIG.headers("sk-go-abc");
        assert_eq!(h.get("Authorization").map(String::as_str), Some("Bearer sk-go-abc"));
        assert_eq!(h.len(), 2);
    }

    #[test]
    fn chat_completions_families_are_kept() {
        for id in ["glm-5", "glm-5.1", "kimi-k2.5", "kimi-k2.7-code", "deepseek-v4-pro", "deepseek-v4.1-flash", "mimo-v2.5-pro", "hy3-preview"] {
            assert!(is_chat_completions_model(id), "{id} should be listed");
        }
    }

    #[test]
    fn other_protocol_families_are_hidden() {
        for id in ["minimax-m2.5", "minimax-m3", "qwen3.6-plus", "qwen3.7-max", "claude-haiku-5-5", "gpt-6-luna", ""] {
            assert!(!is_chat_completions_model(id), "{id} should be hidden");
        }
    }

    #[test]
    fn get_models_filter_keeps_chat_models_sorted() {
        let data = json!({ "object": "list", "data": [
            { "id": "minimax-m2.7" },
            { "id": "kimi-k2.6" },
            { "id": "qwen3.7-plus" },
            { "id": "glm-5.2" },
            { "id": "deepseek-v4.1-flash" }
        ] });
        let models = filter_chat_models(CONFIG.models_from(&data));
        let ids: Vec<&str> = models.iter().map(|m| m.id.as_str()).collect();
        assert_eq!(ids, vec!["deepseek-v4.1-flash", "glm-5.2", "kimi-k2.6"]);
        assert!(models.iter().all(|m| m.provider == "OpenCode Go"));
    }
}
