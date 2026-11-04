//! OpenCode Go: the OpenCode subscription, used with its API key.
//!
//! Go serves every model under `https://opencode.ai/zen/go/v1` and accepts
//! the key as `Authorization: Bearer <key>` (keys from the OpenCode console,
//! `opencode.ai/auth`), but each model family speaks one of three wire
//! formats ([`Protocol`]):
//!
//! * OpenAI chat completions (`/v1/chat/completions`): GLM, Kimi, DeepSeek,
//!   MiMo and anything not listed below. Goes through
//!   [`super::openai_compat`] via [`CONFIG`].
//! * Anthropic messages (`/v1/messages`): MiniMax, Qwen and Claude. Goes
//!   through [`super::anthropic`] with [`messages_endpoint`].
//! * OpenAI responses (`/v1/responses`): GPT. Goes through
//!   [`super::responses`] with [`responses_endpoint`].
//!
//! Every request carries the `x-opencode-session` header (Go refuses
//! requests without one) with this sidebar's [`super::session::id`], and an
//! `aipage/<version>` user agent, both via [`CONFIG`]'s headers.
//!
//! [`protocol_of`] picks the format from the model id, so the whole plan
//! (including the premium models) works for chat, the agentic tools, web
//! search and image generation. The tool loops live in [`crate::agent`].

use super::openai_compat::{OpenAiCompat, OPENCODE_GO};
use super::{anthropic, responses, ModelInfo, SendOptions};

/// The static config: label, base URL, default model, Bearer headers.
pub const CONFIG: &OpenAiCompat = &OPENCODE_GO;

/// The wire format Go serves a model over.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Protocol {
    ChatCompletions,
    AnthropicMessages,
    Responses,
}

/// Model-id prefixes Go serves over the Anthropic messages API.
const MESSAGES_PREFIXES: &[&str] = &["minimax-", "qwen", "claude-"];
/// Model-id prefixes Go serves over the OpenAI responses API.
const RESPONSES_PREFIXES: &[&str] = &["gpt-"];

/// The wire format for a Go model id. The plan's model list changes often,
/// so chat completions is the fallback for any family not listed here.
pub fn protocol_of(model: &str) -> Protocol {
    let m = model.trim().to_ascii_lowercase();
    if MESSAGES_PREFIXES.iter().any(|p| m.starts_with(p)) {
        Protocol::AnthropicMessages
    } else if RESPONSES_PREFIXES.iter().any(|p| m.starts_with(p)) {
        Protocol::Responses
    } else {
        Protocol::ChatCompletions
    }
}

/// The protocol of the model a request will use (the user's or the default).
pub fn protocol_for(opts: &SendOptions) -> Protocol {
    protocol_of(&CONFIG.model_of(opts))
}

/// Go's `/v1/messages` with Anthropic headers plus Go's own (session id,
/// user agent, Bearer key). The key goes in both `x-api-key` (what Anthropic
/// SDKs send) and the Bearer header.
pub fn messages_endpoint(api_key: &str, opts: &SendOptions) -> anthropic::Endpoint {
    let mut headers = anthropic::headers(api_key);
    headers.extend(CONFIG.headers(api_key));
    headers.remove("Content-Type"); // `content-type` is already set
    anthropic::Endpoint {
        url: format!("{}/v1/messages", CONFIG.base_url(opts)),
        headers,
        model: CONFIG.model_of(opts),
    }
}

/// Go's `/v1/responses` with Bearer headers.
pub fn responses_endpoint(api_key: &str, opts: &SendOptions) -> responses::Endpoint {
    responses::Endpoint {
        url: format!("{}/v1/responses", CONFIG.base_url(opts)),
        headers: CONFIG.headers(api_key),
        model: CONFIG.model_of(opts),
    }
}

/// One-shot request (`system` + `user`, no tools) over the model's protocol.
pub async fn complete(system: &str, user: &str, api_key: &str, opts: &SendOptions) -> Result<String, String> {
    match protocol_for(opts) {
        Protocol::AnthropicMessages => messages_endpoint(api_key, opts).complete(system, user).await,
        Protocol::Responses => responses_endpoint(api_key, opts).complete(system, user).await,
        Protocol::ChatCompletions => CONFIG.complete(system, user, api_key, opts).await,
    }
}

/// One-shot chat with the project system prompt.
pub async fn send_message(prompt: &str, api_key: &str, opts: &SendOptions) -> Result<String, String> {
    complete(crate::types::SYSTEM_PROMPT, prompt, api_key, opts).await
}

/// Sort the plan's models by id so the picker is stable.
pub fn sort_models(mut models: Vec<ModelInfo>) -> Vec<ModelInfo> {
    models.sort_by(|a, b| a.id.cmp(&b.id));
    models
}

/// `GET /v1/models`: every model on the plan, sorted.
pub async fn get_models(api_key: &str, opts: &SendOptions) -> Vec<ModelInfo> {
    sort_models(CONFIG.get_models(api_key, opts).await)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::providers::session;
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
        assert_eq!(protocol_for(&SendOptions::default()), Protocol::ChatCompletions);
    }

    #[test]
    fn sends_bearer_session_and_user_agent() {
        let h = CONFIG.headers("sk-go-abc");
        assert_eq!(h.get("Authorization").map(String::as_str), Some("Bearer sk-go-abc"));
        assert_eq!(h.get("x-opencode-session"), Some(&session::id()));
        assert_eq!(h.get("User-Agent").map(String::as_str), Some(session::USER_AGENT));
        assert_eq!(h.get("Content-Type").map(String::as_str), Some("application/json"));
        assert_eq!(h.len(), 4);
        // the same session on every request of this sidebar
        assert_eq!(CONFIG.headers("sk-go-abc").get("x-opencode-session"), h.get("x-opencode-session"));
    }

    #[test]
    fn protocol_by_model_family() {
        for id in ["glm-5", "glm-5.3-flash", "kimi-k2.7-code", "deepseek-v4-pro", "deepseek-v4.1-flash", "mimo-v2.5-pro", "hy3-preview", "grok-5"] {
            assert_eq!(protocol_of(id), Protocol::ChatCompletions, "{id}");
        }
        for id in ["minimax-m2.5", "minimax-m3", "qwen3.6-plus", "qwen3.7-max", "claude-haiku-5-5", "MiniMax-M3"] {
            assert_eq!(protocol_of(id), Protocol::AnthropicMessages, "{id}");
        }
        for id in ["gpt-6-luna", "gpt-5.5"] {
            assert_eq!(protocol_of(id), Protocol::Responses, "{id}");
        }
    }

    #[test]
    fn messages_endpoint_targets_go_with_both_auth_headers() {
        let opts = SendOptions { base_url: Some("https://opencode.ai/zen/go/v1".into()), model_name: Some("minimax-m3".into()) };
        let ep = messages_endpoint("sk-go", &opts);
        assert_eq!(ep.url, "https://opencode.ai/zen/go/v1/messages");
        assert_eq!(ep.model, "minimax-m3");
        assert_eq!(ep.headers.get("x-api-key").map(String::as_str), Some("sk-go"));
        assert_eq!(ep.headers.get("Authorization").map(String::as_str), Some("Bearer sk-go"));
        assert_eq!(ep.headers.get("anthropic-version").map(String::as_str), Some(anthropic::API_VERSION));
        assert_eq!(ep.headers.get("x-opencode-session"), Some(&session::id()));
        assert_eq!(ep.headers.get("User-Agent").map(String::as_str), Some(session::USER_AGENT));
        assert_eq!(ep.headers.get("content-type").map(String::as_str), Some("application/json"));
        assert!(!ep.headers.contains_key("Content-Type"), "one content-type header only");
    }

    #[test]
    fn responses_endpoint_targets_go_with_bearer() {
        let ep = responses_endpoint("sk-go", &SendOptions::with_model("gpt-6-luna"));
        assert_eq!(ep.url, "https://opencode.ai/zen/go/v1/responses");
        assert_eq!(ep.model, "gpt-6-luna");
        assert_eq!(ep.headers.get("Authorization").map(String::as_str), Some("Bearer sk-go"));
        assert_eq!(ep.headers.get("x-opencode-session"), Some(&session::id()));
    }

    #[test]
    fn lists_every_model_sorted() {
        let data = json!({ "object": "list", "data": [
            { "id": "minimax-m2.7" }, { "id": "kimi-k2.6" }, { "id": "gpt-6-luna" }, { "id": "deepseek-v4.1-flash" }
        ] });
        let models = sort_models(CONFIG.models_from(&data));
        let ids: Vec<&str> = models.iter().map(|m| m.id.as_str()).collect();
        assert_eq!(ids, vec!["deepseek-v4.1-flash", "gpt-6-luna", "kimi-k2.6", "minimax-m2.7"]);
        assert!(models.iter().all(|m| m.provider == "OpenCode Go"));
    }
}
