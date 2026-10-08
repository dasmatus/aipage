//! Claude Code, embedded through the Claude Agent SDK.
//!
//! The Agent SDK drives a Claude Code process and only runs under Node/Bun,
//! so it cannot live in the wasm sidebar. `agent-server/` in this repository
//! is a small local HTTP server over the SDK; this module is its client:
//!
//! - `POST {base}/v1/agent` with `{ prompt, model }` runs one Claude Code
//!   turn to completion (Claude Code runs its own tool loop server-side, so
//!   the sidebar's [`crate::agent`] loop is not used) and answers
//!   `{ text, session_id, is_error, num_turns, cost_usd, model }`;
//! - `GET {base}/v1/models` lists the models the server offers, OpenAI-style.
//!
//! The server holds the Anthropic credentials; the sidebar's "API key" field
//! is the server's optional access token, sent as `Authorization: Bearer`.
//! Requests go through the background CORS proxy like every other provider.

use serde_json::{json, Value};

use super::openai_compat::CLAUDE_CODE;
use super::{ModelInfo, SendOptions};
use crate::proxy::post_json;

/// Display label used next to model ids in the picker and in logs.
pub const LABEL: &str = "Claude Code";
/// Where `agent-server` listens by default (`bun run start`).
pub const DEFAULT_BASE_URL: &str = "http://localhost:8787";
/// The server's own default; sent when the user has not picked a model.
pub const DEFAULT_MODEL: &str = "claude-opus-5-5";

pub fn agent_url(opts: &SendOptions) -> String {
    format!("{}/v1/agent", CLAUDE_CODE.base_url(opts))
}

/// The `POST /v1/agent` body.
pub fn agent_body(prompt: &str, opts: &SendOptions) -> Value {
    json!({ "prompt": prompt, "model": CLAUDE_CODE.model_of(opts) })
}

/// The answer text of a `/v1/agent` reply; a run that ended in an error
/// (`is_error`) becomes `Err` with the server's message.
pub fn parse_agent_reply(data: &Value) -> Result<String, String> {
    let text = data.get("text").and_then(Value::as_str).unwrap_or("").trim();
    if data.get("is_error").and_then(Value::as_bool).unwrap_or(false) {
        return Err(if text.is_empty() { "Claude Code failed".to_string() } else { text.to_string() });
    }
    Ok(if text.is_empty() { "No response".to_string() } else { text.to_string() })
}

/// Run one Claude Code turn and return its final answer.
pub async fn send_message(prompt: &str, token: &str, opts: &SendOptions) -> Result<String, String> {
    let data = post_json(&agent_url(opts), &CLAUDE_CODE.headers(token), &agent_body(prompt, opts)).await?;
    parse_agent_reply(&data)
}

/// The models the server offers (empty on error).
pub async fn get_models(token: &str, opts: &SendOptions) -> Vec<ModelInfo> {
    CLAUDE_CODE.get_models(token, opts).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn urls_default_to_the_local_server() {
        let opts = SendOptions::default();
        assert_eq!(agent_url(&opts), "http://localhost:8787/v1/agent");
        assert_eq!(CLAUDE_CODE.models_url(&opts), "http://localhost:8787/v1/models");
        let custom = SendOptions { base_url: Some("http://127.0.0.1:9000/".into()), model_name: None };
        assert_eq!(agent_url(&custom), "http://127.0.0.1:9000/v1/agent");
    }

    #[test]
    fn body_carries_prompt_and_model() {
        assert_eq!(
            agent_body("Ahoj", &SendOptions::default()),
            json!({ "prompt": "Ahoj", "model": "claude-opus-5-5" })
        );
        assert_eq!(
            agent_body("x", &SendOptions::with_model("claude-haiku-5-5"))["model"],
            "claude-haiku-5-5"
        );
    }

    #[test]
    fn token_is_optional() {
        assert!(!CLAUDE_CODE.headers("").contains_key("Authorization"));
        assert_eq!(CLAUDE_CODE.headers("s3cret")["Authorization"], "Bearer s3cret");
        assert_eq!(CLAUDE_CODE.headers("")["Content-Type"], "application/json");
    }

    #[test]
    fn parses_replies() {
        assert_eq!(parse_agent_reply(&json!({ "text": " Hi ", "is_error": false })), Ok("Hi".to_string()));
        assert_eq!(parse_agent_reply(&json!({})), Ok("No response".to_string()));
        assert_eq!(
            parse_agent_reply(&json!({ "text": "Credit balance is too low", "is_error": true })),
            Err("Credit balance is too low".to_string())
        );
        assert_eq!(parse_agent_reply(&json!({ "is_error": true })), Err("Claude Code failed".to_string()));
    }

    #[test]
    fn models_come_from_the_server_list() {
        let data = json!({ "data": [ { "id": "claude-opus-5-5" }, { "id": "claude-haiku-5-5" } ] });
        let models = CLAUDE_CODE.models_from(&data);
        assert_eq!(models.len(), 2);
        assert_eq!(models[0], ModelInfo { id: "claude-opus-5-5".into(), provider: "Claude Code".into() });
    }
}
