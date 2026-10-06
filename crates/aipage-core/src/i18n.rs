//! Internationalization.
//!
//! The translation tables in `locales/*.json` are embedded and deserialized
//! into a strongly-typed [`Translation`]. Default language is Slovak (`sk`).

use serde::Deserialize;

/// `(code, English name)` for every supported UI language, in display order.
pub const LANGUAGES: &[(&str, &str)] = &[
    ("sk", "Slovak"),
    ("en", "English"),
    ("cs", "Czech"),
    ("de", "German"),
    ("hu", "Hungarian"),
];

/// Strongly-typed translation table. Field names are snake_case; serde maps
/// them to the camelCase JSON keys (with explicit overrides for the keys that
/// use consecutive capitals).
#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Translation {
    // Settings
    pub settings_title: String,
    pub settings_description: String,
    pub ai_provider: String,
    pub api_key: String,
    pub save_key: String,
    pub back_to_chat: String,
    pub language: String,
    pub theme_interface: String,
    pub apply_theme_global: String,
    pub auto_update: String,

    // Input labels and hints
    pub base_url: String,
    pub model: String,
    pub refresh_models: String,
    pub loading: String,
    pub api_key_placeholder: String,
    pub api_key_hint: String,

    // Chat Interface
    pub analyze_page: String,
    pub ask_anything: String,

    // App Alerts
    pub alert_content_load_failed: String,
    pub alert_scan_error: String,

    // Chat
    pub send: String,

    // Providers
    #[serde(rename = "providerLMStudio")]
    pub provider_lmstudio: String,
    pub provider_ollama: String,
    pub provider_anthropic: String,

    // Alerts
    pub alert_please_enter_key: String,
    pub alert_settings_saved: String,

    // Themes
    pub theme_edu_page: String,
    pub theme_imessage: String,
    pub theme_messenger: String,
    pub theme_discord: String,
    pub theme_tokyo: String,
    pub theme_mono: String,

    pub no_models_found: String,
    pub settings: String,
    pub chat: String,
    pub engine_mode: String,
    pub ollama_cloud_mode: String,
    pub provider_engine: String,
    pub model_and_auth: String,
    pub free: String,
    pub search_placeholder: String,
    pub search: String,
    pub close_search: String,
    pub search_web: String,
    pub ollama_cloud_api_key: String,
    pub ollama_cloud_api_key_placeholder: String,
    pub ollama_cloud_api_key_hint: String,

    // OpenRouter
    #[serde(rename = "providerOpenRouter")]
    pub provider_openrouter: String,
    pub openrouter_api_key: String,
    pub openrouter_api_key_placeholder: String,
    pub openrouter_api_key_hint: String,

    // ChatGPT / OpenAI
    #[serde(rename = "providerOpenAi")]
    pub provider_openai: String,
    pub openai_api_key: String,
    pub openai_api_key_placeholder: String,
    pub openai_api_key_hint: String,
    // Claude (Anthropic) — `provider_anthropic` is declared above with the
    // other engine labels.
    pub anthropic_api_key: String,
    pub anthropic_api_key_placeholder: String,
    pub anthropic_api_key_hint: String,
    pub appearance_and_app: String,
    pub theme_description: String,
    pub user: String,
    pub ai: String,

    // Image Generation
    pub image_gen: String,
    pub image_gen_enabled: String,
    pub image_gen_prompt_placeholder: String,
    pub image_gen_provider: String,
    pub image_gen_ollama_svg: String,
    #[serde(rename = "imageGenSDWebUI")]
    pub image_gen_sd_webui: String,
    pub image_gen_sd_url: String,
    pub image_gen_sd_url_placeholder: String,
    pub image_gen_model: String,
    pub image_gen_size: String,
    pub image_gen_generating: String,
    pub image_gen_failed: String,

    // Navigation
    pub widgets: String,

    // Hosted (remote) UI
    pub remote_ui: String,
    pub remote_ui_enabled: String,
    pub remote_ui_description: String,
    pub remote_ui_url: String,
    pub remote_ui_url_hint: String,

    // Updates (GitHub releases): channel + extension check
    pub update_channel: String,
    pub update_channel_stable: String,
    pub update_channel_nightly: String,
    pub update_channel_hint: String,
    pub update_check_now: String,
    pub update_checking: String,
    pub update_extension_up_to_date: String,
    pub update_extension_available: String,
    pub update_check_failed: String,

    // Self-updating sidebar bundle (GitHub releases → IndexedDB)
    pub ui_bundle_update: String,
    pub ui_bundle_description: String,
    pub ui_bundle_installed: String,
    pub ui_bundle_none: String,
    pub ui_bundle_check_now: String,
    pub ui_bundle_use_bundled: String,
    pub ui_bundle_result_installed: String,
    pub ui_bundle_result_up_to_date: String,
    pub ui_bundle_result_not_available: String,
    pub ui_bundle_result_older: String,
    pub ui_bundle_cleared: String,
}

const SK: &str = include_str!("locales/sk.json");
const EN: &str = include_str!("locales/en.json");
const CS: &str = include_str!("locales/cs.json");
const DE: &str = include_str!("locales/de.json");
const HU: &str = include_str!("locales/hu.json");

fn raw(lang: &str) -> &'static str {
    match lang {
        "en" => EN,
        "cs" => CS,
        "de" => DE,
        "hu" => HU,
        _ => SK,
    }
}

/// Parse the [`Translation`] table for `lang`, falling back to Slovak for any
/// unknown code.
pub fn translation(lang: &str) -> Translation {
    serde_json::from_str(raw(lang)).expect("embedded locale JSON is valid")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_locale_parses_into_all_fields() {
        for (code, _name) in LANGUAGES {
            // A missing/renamed key would make from_str fail here.
            let t = translation(code);
            assert!(!t.settings_title.is_empty(), "{code} settings_title empty");
            assert!(!t.widgets.is_empty(), "{code} widgets empty");
            assert!(!t.provider_lmstudio.is_empty(), "{code} providerLMStudio empty");
            assert_eq!(t.provider_openrouter, "OpenRouter", "{code} providerOpenRouter");
            assert!(!t.openrouter_api_key_hint.is_empty(), "{code} openrouterApiKeyHint empty");
            assert_eq!(t.provider_openai, "ChatGPT / OpenAI", "{code} providerOpenAi");
            assert!(!t.openai_api_key.is_empty(), "{code} openaiApiKey empty");
            assert!(!t.openai_api_key_placeholder.is_empty(), "{code} openaiApiKeyPlaceholder empty");
            assert!(t.openai_api_key_hint.contains("platform.openai.com/api-keys"), "{code} openaiApiKeyHint");
            assert_eq!(t.provider_anthropic, "Claude (Anthropic)", "{code} providerAnthropic");
            assert!(!t.anthropic_api_key.is_empty(), "{code} anthropicApiKey empty");
            assert_eq!(t.anthropic_api_key_placeholder, "sk-ant-...", "{code} anthropicApiKeyPlaceholder");
            assert!(!t.anthropic_api_key_hint.is_empty(), "{code} anthropicApiKeyHint empty");
            assert!(!t.image_gen_sd_webui.is_empty(), "{code} imageGenSDWebUI empty");
            assert!(!t.remote_ui_enabled.is_empty(), "{code} remoteUiEnabled empty");
            assert!(t.auto_update.contains("GitHub"), "{code} autoUpdate should name GitHub");
            assert!(!t.update_channel_nightly.is_empty(), "{code} updateChannelNightly empty");
            // placeholders the settings view substitutes
            assert!(t.ui_bundle_update.contains("{channel}"), "{code} uiBundleUpdate needs {{channel}}");
            assert!(t.ui_bundle_result_installed.contains("{version}"), "{code} uiBundleResultInstalled needs {{version}}");
            assert!(t.ui_bundle_result_older.contains("{version}"), "{code} uiBundleResultOlder needs {{version}}");
            assert!(t.update_extension_up_to_date.contains("{version}"), "{code} updateExtensionUpToDate needs {{version}}");
            assert!(t.update_extension_available.contains("{version}"), "{code} updateExtensionAvailable needs {{version}}");
            assert!(t.update_check_failed.contains("{error}"), "{code} updateCheckFailed needs {{error}}");
        }
    }

    #[test]
    fn unknown_language_falls_back_to_slovak() {
        let sk = translation("sk");
        let unknown = translation("xx");
        assert_eq!(sk.settings_title, unknown.settings_title);
    }
}
