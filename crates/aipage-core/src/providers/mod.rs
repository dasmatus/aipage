//! AI providers. Mirrors `src/sidebar/providers/*`.
//!
//! Dispatch is by [`ProviderType`] rather than a `dyn` async trait (simpler in
//! single-threaded wasm). Network requests are routed through the background
//! CORS proxy via [`crate::proxy`]. Pure helpers (URL normalization, response
//! parsing) are split out so they can be unit-tested natively.
//!
//! OpenAI-compatible backends (Ollama Cloud, OpenRouter, LM Studio, and local
//! Ollama's `/v1` layer) share one client, [`openai_compat::OpenAiCompat`]; a
//! concrete provider module is a thin wrapper over one static config. Claude
//! ([`anthropic`]) speaks the Anthropic Messages API and owns its wire format.
//!
//! # Adding a provider
//!
//! Every touch point, in order. Grep for `OpenRouter` to see a complete
//! worked example of each step.
//!
//! 1. **`crates/aipage-core/src/types.rs`** — add the [`ProviderType`] variant
//!    with its `#[serde(rename = "...")]` stored string; extend `as_str`,
//!    `display_name`, `from_str_or_default`, `is_local` (cloud = API key
//!    required) and `supports_native_tools` (true if the backend accepts
//!    OpenAI-style function tools, which turns on the agentic chat + native
//!    web-search loop); extend the round-trip / from_str tests.
//! 2. **`crates/aipage-core/src/storage.rs`** — add the `<name>_api_key`,
//!    `<name>_base_url` and `<name>_model` keys to `api_key_key` and
//!    `local_settings_keys`. Keys are the persisted contract; never rename.
//! 3. **`crates/aipage-core/src/providers/<name>.rs`** — new module.
//!    * OpenAI-compatible backend: declare one `OpenAiCompat` const in
//!      [`openai_compat`] (label, default base URL *without* `/v1`, default
//!      model, extra headers), add it to `OpenAiCompat::for_provider`, and
//!      forward `send_message` / `get_models` / `web_search` to it (copy
//!      `openrouter.rs`). Keep a couple of native unit tests for the URL /
//!      header shape.
//!    * Other wire formats (Anthropic Messages API, OpenAI Responses API):
//!      implement `send_message(prompt, api_key, opts)` and
//!      `get_models(api_key, opts)` yourself over [`crate::proxy`]; keep the
//!      JSON parsing in pure functions with tests (`anthropic.rs` +
//!      `tests/anthropic.rs` is the worked example). `for_provider` is total,
//!      so either give it the backend's OpenAI-compatible surface or return
//!      a sensible fallback and gate the callers below.
//! 4. **`crates/aipage-core/src/providers/mod.rs`** (this file) — `pub mod`,
//!    plus arms in [`send_message`], [`get_models`], [`web_search`] and
//!    [`default_base_url`] (the URL pre-filled in the settings form).
//! 5. **`crates/aipage-core/src/agent.rs`** — nothing for OpenAI-tool backends
//!    (the loop takes an `OpenAiCompat`). A backend with its own tool
//!    protocol needs its own loop, dispatched on `ProviderType` in
//!    `run_agent_turn` / `web_search` (see the Anthropic loop there).
//! 6. **`crates/aipage-core/src/imagegen.rs`** — SVG image generation posts an
//!    OpenAI-style chat completion via `OpenAiCompat::for_provider`; add a
//!    branch if the backend cannot serve that, and extend
//!    `resolve_svg_model` if its default model id needs mapping.
//! 7. **`crates/aipage-core/src/i18n.rs` + `src/locales/{sk,en,cs,de,hu}.json`**
//!    — add `provider<Name>` (select label), `<name>ApiKey`,
//!    `<name>ApiKeyPlaceholder`, `<name>ApiKeyHint` to *all five* JSON files
//!    and the typed `Translation` struct (the locale test fails otherwise).
//! 8. **`crates/aipage-sidebar/src/components/settings.rs`** — `<option>` in
//!    the engine `<select>` and an arm in `api_key_strings`. Base-URL default
//!    and the key-required alert are derived from steps 1 and 4.
//! 9. **`crates/aipage-sidebar/src/state.rs` / `app.rs`** — nothing, as long
//!    as they keep using the `ProviderType` predicates (`is_local`,
//!    `supports_native_tools`) rather than matching a variant.
//! 10. **`assets/manifest.{chrome,firefox,safari}.json`** — add the API host
//!     to `permissions` (`https://host/*`) *and* to the CSP `connect-src`.
//!     The background proxy (`crates/aipage-background/src/lib.rs`,
//!     `handle_proxy_fetch`) has no host allow-list; the browser enforces the
//!     manifest permissions on its `fetch`.
//! 11. **Docs** — `README.md` "Supported Providers" + a setup subsection;
//!     `CHANGELOG.md` under "Unreleased".
//! 12. **Validate** — `cargo test --workspace`,
//!     `cargo clippy --workspace --all-targets -- -D warnings`,
//!     `cargo check --target wasm32-unknown-unknown -p aipage-sidebar -p aipage-background -p aipage-content`,
//!     then `cargo run -p xtask -- build --target chrome` and load `dist-chrome/`.

pub mod anthropic;
pub mod lmstudio;
pub mod ollama;
pub mod ollama_cloud;
pub mod openai_compat;
pub mod openrouter;

use crate::types::ProviderType;

/// Per-request overrides (base URL / model), mirroring the TS `options` arg.
#[derive(Clone, Debug, Default)]
pub struct SendOptions {
    pub base_url: Option<String>,
    pub model_name: Option<String>,
}

impl SendOptions {
    pub fn with_model(model: impl Into<String>) -> Self {
        Self { base_url: None, model_name: Some(model.into()) }
    }
}

/// A model entry as surfaced to the settings model picker.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ModelInfo {
    pub id: String,
    pub provider: String,
}

/// The base URL pre-filled in the settings form when the user has not saved
/// one. LM Studio shows the `/v1` suffix (as its own UI does); every client
/// strips it again before building `/v1/...` paths.
pub fn default_base_url(provider: ProviderType) -> &'static str {
    match provider {
        ProviderType::OllamaCloud => ollama_cloud::CONFIG.default_base_url,
        ProviderType::OpenRouter => openrouter::CONFIG.default_base_url,
        ProviderType::Anthropic => anthropic::DEFAULT_BASE_URL,
        ProviderType::Lmstudio => "http://localhost:1234/v1",
        ProviderType::Ollama => ollama::CONFIG.default_base_url,
    }
}

/// Send a chat message to the selected provider, returning the full text.
pub async fn send_message(
    provider: ProviderType,
    prompt: &str,
    api_key: &str,
    opts: &SendOptions,
) -> Result<String, String> {
    match provider {
        ProviderType::OllamaCloud => ollama_cloud::send_message(prompt, api_key, opts).await,
        ProviderType::OpenRouter => openrouter::send_message(prompt, api_key, opts).await,
        ProviderType::Anthropic => anthropic::send_message(prompt, api_key, opts).await,
        ProviderType::Ollama => ollama::send_message(prompt, api_key, opts).await,
        ProviderType::Lmstudio => lmstudio::send_message(prompt, api_key, opts).await,
    }
}

/// Fetch the provider's available models (empty on error, matching the TS).
pub async fn get_models(
    provider: ProviderType,
    api_key: &str,
    opts: &SendOptions,
) -> Vec<ModelInfo> {
    match provider {
        ProviderType::OllamaCloud => ollama_cloud::get_models(api_key, opts).await,
        ProviderType::OpenRouter => openrouter::get_models(api_key, opts).await,
        ProviderType::Anthropic => anthropic::get_models(api_key, opts).await,
        ProviderType::Ollama => ollama::get_models(opts).await,
        ProviderType::Lmstudio => lmstudio::get_models(opts).await,
    }
}

/// Native web search. Providers with OpenAI-style function tools implement it
/// via a tool-calling round over the background DuckDuckGo searcher; Claude
/// uses its server-side `web_search` tool; local providers return an error
/// and the sidebar falls back to its own DuckDuckGo + summarize path.
pub async fn web_search(
    provider: ProviderType,
    query: &str,
    api_key: &str,
    opts: &SendOptions,
) -> Result<String, String> {
    match provider {
        ProviderType::OllamaCloud => ollama_cloud::web_search(query, api_key, opts).await,
        ProviderType::OpenRouter => openrouter::web_search(query, api_key, opts).await,
        ProviderType::Anthropic => anthropic::web_search(query, api_key, opts).await,
        _ => Err("This provider does not support native web search".to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_base_urls_per_provider() {
        assert_eq!(default_base_url(ProviderType::OllamaCloud), "https://ollama.com");
        assert_eq!(default_base_url(ProviderType::OpenRouter), "https://openrouter.ai/api");
        assert_eq!(default_base_url(ProviderType::Anthropic), "https://api.anthropic.com");
        assert_eq!(default_base_url(ProviderType::Lmstudio), "http://localhost:1234/v1");
        assert_eq!(default_base_url(ProviderType::Ollama), "http://localhost:11434");
    }
}
