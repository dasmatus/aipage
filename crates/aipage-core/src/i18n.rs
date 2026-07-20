//! Internationalization. Mirrors `src/sidebar/i18n.ts` + `locales/*`.
//!
//! The translation tables are the exact JSON dumped from the original TS
//! locales (see `scripts/dump-locales.ts`), embedded and deserialized into a
//! strongly-typed [`Translation`]. Default language is Slovak (`sk`).

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
/// them to the camelCase JSON keys (with two explicit overrides for the keys
/// that use consecutive capitals).
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

    // Instructions
    pub instructions_title: String,

    // Input labels and hints
    pub base_url: String,
    pub model: String,
    pub select_model: String,
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
    pub chat_placeholder: String,
    pub send: String,
    pub error_api_key: String,
    pub error_network: String,
    pub error_general: String,

    // Providers
    #[serde(rename = "providerLMStudio")]
    pub provider_lmstudio: String,
    pub provider_ollama: String,
    pub provider_anthropic: String,

    // LM Studio instructions
    pub lmstudio_instructions_title: String,
    pub lmstudio_step1: String,
    pub lmstudio_step2: String,
    pub lmstudio_step3: String,
    pub lmstudio_step4: String,
    pub lmstudio_step5: String,
    pub lmstudio_note: String,

    // Ollama instructions
    pub ollama_instructions_title: String,
    pub ollama_step1: String,
    pub ollama_step2: String,
    pub ollama_step3: String,
    pub ollama_step4: String,
    pub ollama_note: String,

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
    pub standard_mode: String,
    pub ollama_cloud_mode: String,
    pub anthropic_description: String,
    pub standard_description: String,
    pub provider_engine: String,
    pub select_engine: String,
    pub select_provider: String,
    pub model_and_auth: String,
    pub free: String,
    pub search_placeholder: String,
    pub search: String,
    pub close_search: String,
    pub search_web: String,
    pub ollama_cloud_api_key: String,
    pub ollama_cloud_api_key_placeholder: String,
    pub ollama_cloud_api_key_hint: String,
    pub appearance_and_app: String,
    pub theme_description: String,
    pub global_theme_description: String,
    pub auto_update_description: String,
    pub user: String,
    pub ai: String,
    pub anthropic_badge: String,
    pub anthropic_get_key_notice: String,

    // Exa
    pub exa_api_key: String,
    pub exa_api_key_placeholder: String,
    pub exa_api_key_hint: String,
    pub enable_exa_search: String,

    // SearXNG
    pub searxng_search: String,
    pub searxng_enabled: String,
    pub searxng_url: String,
    pub searxng_url_placeholder: String,
    pub searxng_url_hint: String,

    // Image Generation
    pub image_gen: String,
    pub image_gen_enabled: String,
    pub image_gen_prompt_placeholder: String,
    pub image_gen_provider: String,
    pub image_gen_ollama_svg: String,
    pub image_gen_ollama_svg_hint: String,
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
/// unknown code. Mirrors `t(key, lang)` resolution semantics.
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
            assert!(!t.image_gen_sd_webui.is_empty(), "{code} imageGenSDWebUI empty");
        }
    }

    #[test]
    fn unknown_language_falls_back_to_slovak() {
        let sk = translation("sk");
        let unknown = translation("xx");
        assert_eq!(sk.settings_title, unknown.settings_title);
    }
}
