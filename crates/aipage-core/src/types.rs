//! Core data model. Mirrors `src/sidebar/types.ts` and `providers/types.ts`.

use serde::{Deserialize, Serialize};

/// Default system prompt used when none is supplied.
pub const SYSTEM_PROMPT: &str = "You are a helpful assistant that answers questions correctly.";

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Role {
    User,
    Ai,
}

/// A clickable context action attached to an AI message (e.g. "Answer").
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct ContextAction {
    pub label: String,
    /// e.g. `answer`, `summarize`, `explain_selection`.
    pub action: String,
    pub primary: bool,
}

/// A single chat message.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Message {
    pub id: String,
    pub role: Role,
    pub content: String,
    pub timestamp: f64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub actions: Option<Vec<ContextAction>>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        rename = "imageUrl"
    )]
    pub image_url: Option<String>,
}

impl Message {
    pub fn new(id: impl Into<String>, role: Role, content: impl Into<String>, timestamp: f64) -> Self {
        Self {
            id: id.into(),
            role,
            content: content.into(),
            timestamp,
            actions: None,
            image_url: None,
        }
    }
}

/// Response shape returned by the content script's `get_page_content`.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct PageContentResponse {
    pub content: Option<String>,
    #[serde(default, rename = "isSelection")]
    pub is_selection: Option<bool>,
    #[serde(default)]
    pub images: Option<Vec<String>>,
    #[serde(default)]
    pub error: Option<String>,
}

/// Which AI backend a request targets:
/// `'ollama-cloud' | 'openrouter' | 'openai' | 'lmstudio' | 'ollama'`.
/// `OllamaCloud` is the hosted Ollama service, `OpenRouter` the OpenRouter
/// gateway and `OpenAi` the public OpenAI platform API (ChatGPT models); all
/// three are OpenAI-compatible and need an API key. The two local variants
/// talk to a self-hosted Ollama / LM Studio on the loopback.
///
/// See the "Adding a provider" checklist in [`crate::providers`].
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
#[derive(Default)]
pub enum ProviderType {
    #[default]
    #[serde(rename = "ollama-cloud")]
    OllamaCloud,
    #[serde(rename = "openrouter")]
    OpenRouter,
    #[serde(rename = "openai")]
    OpenAi,
    Lmstudio,
    Ollama,
}

impl ProviderType {
    /// Every provider, in settings-menu order.
    pub const ALL: [ProviderType; 5] = [
        ProviderType::OllamaCloud,
        ProviderType::OpenRouter,
        ProviderType::OpenAi,
        ProviderType::Ollama,
        ProviderType::Lmstudio,
    ];

    pub fn as_str(self) -> &'static str {
        match self {
            ProviderType::OllamaCloud => "ollama-cloud",
            ProviderType::OpenRouter => "openrouter",
            ProviderType::OpenAi => "openai",
            ProviderType::Lmstudio => "lmstudio",
            ProviderType::Ollama => "ollama",
        }
    }

    pub fn display_name(self) -> &'static str {
        match self {
            ProviderType::OllamaCloud => "Ollama Cloud",
            ProviderType::OpenRouter => "OpenRouter",
            ProviderType::OpenAi => "ChatGPT / OpenAI",
            ProviderType::Lmstudio => "LM Studio",
            ProviderType::Ollama => "Ollama",
        }
    }

    /// Parse a stored string, defaulting to Ollama Cloud for unknown values
    /// (matches `getProviderPreference`). The legacy `"anthropic"` value maps
    /// to the new default so pre-migration installs land on the cloud backend.
    pub fn from_str_or_default(s: &str) -> Self {
        match s {
            "ollama-cloud" | "anthropic" => ProviderType::OllamaCloud,
            "openrouter" => ProviderType::OpenRouter,
            "openai" => ProviderType::OpenAi,
            "lmstudio" => ProviderType::Lmstudio,
            "ollama" => ProviderType::Ollama,
            _ => ProviderType::OllamaCloud,
        }
    }

    /// Whether this backend runs on the user's own machine (no API key needed).
    pub fn is_local(self) -> bool {
        matches!(self, ProviderType::Lmstudio | ProviderType::Ollama)
    }

    /// Whether this backend requires an API key (every cloud backend).
    pub fn requires_api_key(self) -> bool {
        !self.is_local()
    }

    /// Whether this backend accepts OpenAI-style function tools, enabling the
    /// agentic chat loop and native web search in [`crate::agent`].
    pub fn supports_native_tools(self) -> bool {
        matches!(self, ProviderType::OllamaCloud | ProviderType::OpenRouter | ProviderType::OpenAi)
    }
}


#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn provider_roundtrips_through_json() {
        for p in ProviderType::ALL {
            let json = serde_json::to_string(&p).unwrap();
            let back: ProviderType = serde_json::from_str(&json).unwrap();
            assert_eq!(p, back);
            // serialized form must match the stored string contract
            assert_eq!(json, format!("\"{}\"", p.as_str()));
            assert_eq!(ProviderType::from_str_or_default(p.as_str()), p);
        }
    }

    #[test]
    fn ollama_cloud_serializes_with_hyphen() {
        assert_eq!(serde_json::to_string(&ProviderType::OllamaCloud).unwrap(), "\"ollama-cloud\"");
    }

    #[test]
    fn openrouter_serializes_lowercase() {
        assert_eq!(serde_json::to_string(&ProviderType::OpenRouter).unwrap(), "\"openrouter\"");
        assert_eq!(ProviderType::OpenRouter.display_name(), "OpenRouter");
    }

    #[test]
    fn openai_serializes_lowercase() {
        assert_eq!(serde_json::to_string(&ProviderType::OpenAi).unwrap(), "\"openai\"");
        assert_eq!(serde_json::from_str::<ProviderType>("\"openai\"").unwrap(), ProviderType::OpenAi);
        assert_eq!(ProviderType::OpenAi.as_str(), "openai");
        assert_eq!(ProviderType::OpenAi.display_name(), "ChatGPT / OpenAI");
    }

    #[test]
    fn provider_from_str_defaults_to_ollama_cloud() {
        assert_eq!(ProviderType::from_str_or_default("ollama-cloud"), ProviderType::OllamaCloud);
        assert_eq!(ProviderType::from_str_or_default("openrouter"), ProviderType::OpenRouter);
        assert_eq!(ProviderType::from_str_or_default("openai"), ProviderType::OpenAi);
        assert_eq!(ProviderType::from_str_or_default("ollama"), ProviderType::Ollama);
        assert_eq!(ProviderType::from_str_or_default("lmstudio"), ProviderType::Lmstudio);
        // legacy "anthropic" stored value migrates to the new default
        assert_eq!(ProviderType::from_str_or_default("anthropic"), ProviderType::OllamaCloud);
        assert_eq!(ProviderType::from_str_or_default("bogus"), ProviderType::OllamaCloud);
    }

    #[test]
    fn default_provider_is_ollama_cloud() {
        assert_eq!(ProviderType::default(), ProviderType::OllamaCloud);
    }

    #[test]
    fn is_local_flag() {
        assert!(!ProviderType::OllamaCloud.is_local());
        assert!(!ProviderType::OpenRouter.is_local());
        assert!(!ProviderType::OpenAi.is_local());
        assert!(ProviderType::Lmstudio.is_local());
        assert!(ProviderType::Ollama.is_local());
    }

    #[test]
    fn cloud_providers_need_a_key_and_support_tools() {
        for p in ProviderType::ALL {
            assert_eq!(p.requires_api_key(), !p.is_local(), "{p:?}");
            assert_eq!(p.supports_native_tools(), !p.is_local(), "{p:?}");
        }
    }

    #[test]
    fn role_serializes_lowercase() {
        assert_eq!(serde_json::to_string(&Role::Ai).unwrap(), "\"ai\"");
        assert_eq!(serde_json::to_string(&Role::User).unwrap(), "\"user\"");
    }
}
