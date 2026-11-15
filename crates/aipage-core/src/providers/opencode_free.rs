//! OpenCode Free: the free models of the OpenCode inference endpoint.
//!
//! The endpoint serves chat completions at
//! `https://opencode.ai/inference/openai/v1/chat/completions` with the key as
//! `Authorization: Bearer <key>` (keys from the OpenCode console,
//! `opencode.ai/auth`), so chat, the agentic tools, web search and image
//! generation all go through [`super::openai_compat`] via [`CONFIG`].
//!
//! Two things differ from the other compatible backends:
//!
//! * The model list lives at `https://opencode.ai/inference/v1/models`, not
//!   under the `/openai` prefix the chat path uses, so [`models_url`] strips
//!   that prefix before appending `/v1/models`.
//! * That list covers every model the endpoint serves, so [`models_from`]
//!   keeps only the free ones ([`is_free`]: zero input and output price, or
//!   the `-free` id suffix when the entry carries no price).
//!
//! Every free model speaks chat completions with function tools, so the tool
//! loops in [`crate::agent`] need no per-model routing.

use serde_json::Value;

use super::openai_compat::{OpenAiCompat, OPENCODE_FREE};
use super::{ModelInfo, SendOptions};

/// The static config: label, base URL, default model, Bearer headers.
pub const CONFIG: &OpenAiCompat = &OPENCODE_FREE;

/// The `/openai` path segment the chat endpoint adds and the model list does
/// not have.
const CHAT_PREFIX: &str = "/openai";

/// The model list URL for a base URL: the `/openai` segment is dropped, so
/// both `https://opencode.ai/inference/openai` and
/// `https://opencode.ai/inference` resolve to
/// `https://opencode.ai/inference/v1/models`.
pub fn models_url(opts: &SendOptions) -> String {
    let base = CONFIG.base_url(opts);
    let root = base.strip_suffix(CHAT_PREFIX).unwrap_or(&base);
    format!("{root}/v1/models")
}

/// Whether a `/v1/models` entry is a free model: zero input and output price
/// when the entry carries a price, else the `-free` id suffix (or
/// `big-pickle`, the free flagship that has no suffix).
pub fn is_free(model: &Value) -> bool {
    let price = |key: &str| {
        model
            .pointer("/cost/text")
            .and_then(|t| t.get(key))
            .and_then(|p| p.get("price"))
            .and_then(Value::as_f64)
    };
    match (price("input"), price("output")) {
        (Some(input), Some(output)) => input == 0.0 && output == 0.0,
        _ => {
            let id = model.get("id").and_then(Value::as_str).unwrap_or_default();
            id.ends_with("-free") || id == "big-pickle"
        }
    }
}

/// Map a model list to the free models only, labelled with this provider.
pub fn models_from(data: &Value) -> Vec<ModelInfo> {
    let mut models: Vec<ModelInfo> = data
        .get("data")
        .and_then(Value::as_array)
        .map(|arr| {
            arr.iter()
                .filter(|m| is_free(m))
                .filter_map(|m| m.get("id").and_then(Value::as_str))
                .map(|id| ModelInfo { id: id.to_string(), provider: CONFIG.label.to_string() })
                .collect()
        })
        .unwrap_or_default();
    models.sort_by(|a, b| a.id.cmp(&b.id));
    models
}

/// One-shot chat with the project system prompt.
pub async fn send_message(prompt: &str, api_key: &str, opts: &SendOptions) -> Result<String, String> {
    CONFIG.send_message(prompt, api_key, opts).await
}

/// `GET /v1/models` on the inference root, filtered to the free models.
pub async fn get_models(api_key: &str, opts: &SendOptions) -> Vec<ModelInfo> {
    match crate::proxy::perform_request(&models_url(opts), "GET", &CONFIG.headers(api_key), None).await {
        Ok(data) => models_from(&data),
        Err(e) => {
            aipage_bindings::console::error(format!("Failed to fetch {} models: {e}", CONFIG.label));
            Vec::new()
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::providers::session;
    use serde_json::json;

    #[test]
    fn chat_url_targets_the_openai_prefix() {
        let expected = "https://opencode.ai/inference/openai/v1/chat/completions";
        for raw in ["", "https://opencode.ai/inference/openai", "https://opencode.ai/inference/openai/v1", "https://opencode.ai/inference/openai/v1/"] {
            let opts = SendOptions { base_url: Some(raw.into()), model_name: None };
            assert_eq!(CONFIG.chat_url(&opts), expected, "{raw}");
        }
    }

    #[test]
    fn models_url_drops_the_openai_prefix() {
        let expected = "https://opencode.ai/inference/v1/models";
        for raw in ["", "https://opencode.ai/inference", "https://opencode.ai/inference/openai", "https://opencode.ai/inference/openai/v1"] {
            let opts = SendOptions { base_url: Some(raw.into()), model_name: None };
            assert_eq!(models_url(&opts), expected, "{raw}");
        }
    }

    #[test]
    fn default_model_and_label() {
        assert_eq!(CONFIG.label, "OpenCode Free");
        assert_eq!(CONFIG.model_of(&SendOptions::default()), "big-pickle");
    }

    #[test]
    fn sends_bearer_session_and_user_agent() {
        let h = CONFIG.headers("sk-free-abc");
        assert_eq!(h.get("Authorization").map(String::as_str), Some("Bearer sk-free-abc"));
        assert_eq!(h.get("x-opencode-session"), Some(&session::id()));
        assert_eq!(h.get("User-Agent").map(String::as_str), Some(session::USER_AGENT));
    }

    #[test]
    fn free_models_by_price_or_id() {
        assert!(is_free(&json!({ "id": "big-pickle", "cost": { "text": { "input": { "price": 0 }, "output": { "price": 0 } } } })));
        assert!(!is_free(&json!({ "id": "glm-5", "cost": { "text": { "input": { "price": 1 }, "output": { "price": 3.2 } } } })));
        // no price block: the id decides
        assert!(is_free(&json!({ "id": "beam-free" })));
        assert!(is_free(&json!({ "id": "big-pickle" })));
        assert!(!is_free(&json!({ "id": "claude-opus-5-5" })));
    }

    #[test]
    fn keeps_only_free_models_sorted() {
        let data = json!({ "object": "list", "data": [
            { "id": "glm-5", "cost": { "text": { "input": { "price": 1 }, "output": { "price": 3.2 } } } },
            { "id": "mimo-v2.6-flash-free", "cost": { "text": { "input": { "price": 0 }, "output": { "price": 0 } } } },
            { "id": "big-pickle", "cost": { "text": { "input": { "price": 0 }, "output": { "price": 0 } } } },
            { "id": "claude-opus-5-5", "cost": { "text": { "input": { "price": 5 }, "output": { "price": 25 } } } }
        ] });
        let models = models_from(&data);
        let ids: Vec<&str> = models.iter().map(|m| m.id.as_str()).collect();
        assert_eq!(ids, vec!["big-pickle", "mimo-v2.6-flash-free"]);
        assert!(models.iter().all(|m| m.provider == "OpenCode Free"));
        assert!(models_from(&json!({})).is_empty());
    }
}
