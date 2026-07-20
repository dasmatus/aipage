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

/// Which AI backend a request targets. Mirrors the TS `ProviderType` union
/// `'anthropic' | 'lmstudio' | 'ollama'`.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
#[derive(Default)]
pub enum ProviderType {
    #[default]
    Anthropic,
    Lmstudio,
    Ollama,
}

impl ProviderType {
    pub fn as_str(self) -> &'static str {
        match self {
            ProviderType::Anthropic => "anthropic",
            ProviderType::Lmstudio => "lmstudio",
            ProviderType::Ollama => "ollama",
        }
    }

    pub fn display_name(self) -> &'static str {
        match self {
            ProviderType::Anthropic => "Claude (Anthropic)",
            ProviderType::Lmstudio => "LM Studio",
            ProviderType::Ollama => "Ollama",
        }
    }

    /// Parse a stored string, defaulting to Anthropic for unknown values
    /// (matches `getProviderPreference`).
    pub fn from_str_or_default(s: &str) -> Self {
        match s {
            "lmstudio" => ProviderType::Lmstudio,
            "ollama" => ProviderType::Ollama,
            _ => ProviderType::Anthropic,
        }
    }
}


#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn provider_roundtrips_through_json() {
        for p in [ProviderType::Anthropic, ProviderType::Lmstudio, ProviderType::Ollama] {
            let json = serde_json::to_string(&p).unwrap();
            let back: ProviderType = serde_json::from_str(&json).unwrap();
            assert_eq!(p, back);
            // serialized form must match the stored string contract
            assert_eq!(json, format!("\"{}\"", p.as_str()));
        }
    }

    #[test]
    fn provider_from_str_defaults_to_anthropic() {
        assert_eq!(ProviderType::from_str_or_default("ollama"), ProviderType::Ollama);
        assert_eq!(ProviderType::from_str_or_default("lmstudio"), ProviderType::Lmstudio);
        assert_eq!(ProviderType::from_str_or_default("bogus"), ProviderType::Anthropic);
    }

    #[test]
    fn role_serializes_lowercase() {
        assert_eq!(serde_json::to_string(&Role::Ai).unwrap(), "\"ai\"");
        assert_eq!(serde_json::to_string(&Role::User).unwrap(), "\"user\"");
    }
}
