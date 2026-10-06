//! `browser.storage.local` access.
//!
//! The key strings are a persisted contract: existing installs keep their
//! settings only as long as they never change.

use aipage_bindings::storage;
use js_sys::{Array, Object, Reflect};
use wasm_bindgen::JsValue;

use crate::oauth::{TokenSet, KEY_OPENAI_OAUTH, KEY_OPENAI_OAUTH_CLIENT_ID};
use crate::remote_ui::{KEY_REMOTE_UI_ENABLED, KEY_REMOTE_UI_URL};
use crate::types::ProviderType;
use crate::updates::{UpdateChannel, KEY_UI_BUNDLE_UPDATE_ENABLED, KEY_UPDATE_CHANNEL, KEY_UPDATE_NOTIFIED_SHA};

const KEY_PROVIDER: &str = "ai_provider";
const KEY_PROVIDER_BACKEND: &str = "providerBackend";
const KEY_THEME: &str = "ai_sidebar_theme";
const KEY_GLOBAL_THEME: &str = "ai_sidebar_global";
const KEY_AUTO_UPDATE: &str = "autoUpdate";
const KEY_LANGUAGE: &str = "language";
const KEY_IMAGE_GEN_ENABLED: &str = "image_gen_enabled";
const KEY_IMAGE_GEN_PROVIDER: &str = "image_gen_provider";
const KEY_IMAGE_GEN_SD_URL: &str = "image_gen_sd_url";
const KEY_IMAGE_GEN_MODEL: &str = "image_gen_model";
const KEY_IMAGE_GEN_SIZE: &str = "image_gen_size";
const KEY_AUTO_ANSWER_ENABLED: &str = "auto_answer_enabled";
const KEY_WIDGET_NOTES: &str = "widget_notes";

fn api_key_key(p: ProviderType) -> &'static str {
    match p {
        ProviderType::Lmstudio => "lmstudio_api_key",
        ProviderType::Ollama => "ollama_api_key",
        ProviderType::OllamaCloud => "ollama_cloud_api_key",
        ProviderType::OpenRouter => "openrouter_api_key",
        ProviderType::OpenAi => "openai_api_key",
        ProviderType::Anthropic => "anthropic_api_key",
    }
}

/// `(url_key, model_key)` pair for a provider's local settings.
fn local_settings_keys(p: ProviderType) -> (&'static str, &'static str) {
    match p {
        ProviderType::Lmstudio => ("lmstudio_base_url", "lmstudio_model"),
        ProviderType::Ollama => ("ollama_base_url", "ollama_model"),
        ProviderType::OllamaCloud => ("ollama_cloud_base_url", "ollama_cloud_model"),
        ProviderType::OpenRouter => ("openrouter_base_url", "openrouter_model"),
        ProviderType::OpenAi => ("openai_base_url", "openai_model"),
        ProviderType::Anthropic => ("anthropic_base_url", "anthropic_model"),
    }
}

// --- low-level helpers ---

async fn get_raw(key: &str) -> JsValue {
    let arr = Array::new();
    arr.push(&JsValue::from_str(key));
    let result = storage::local_get(arr.as_ref()).await.unwrap_or(JsValue::UNDEFINED);
    Reflect::get(&result, &JsValue::from_str(key)).unwrap_or(JsValue::UNDEFINED)
}

async fn get_string(key: &str) -> Option<String> {
    get_raw(key).await.as_string()
}

async fn get_bool(key: &str) -> bool {
    let v = get_raw(key).await;
    v.as_bool().unwrap_or(false)
}

async fn set_value(key: &str, value: JsValue) {
    let obj = Object::new();
    let _ = Reflect::set(&obj, &JsValue::from_str(key), &value);
    let _ = storage::local_set(obj.as_ref()).await;
}

async fn set_string(key: &str, value: &str) {
    set_value(key, JsValue::from_str(value)).await;
}

async fn set_bool(key: &str, value: bool) {
    set_value(key, JsValue::from_bool(value)).await;
}

// --- provider preference ---

pub async fn get_provider_preference() -> ProviderType {
    ProviderType::from_str_or_default(&get_string(KEY_PROVIDER).await.unwrap_or_default())
}

pub async fn save_provider_preference(p: ProviderType) {
    set_string(KEY_PROVIDER, p.as_str()).await;
}

/// Legacy mirror of the provider preference, still written for installs
/// that read it.
pub async fn save_provider_backend_preference(p: ProviderType) {
    set_string(KEY_PROVIDER_BACKEND, p.as_str()).await;
}

// --- api keys ---

pub async fn get_api_key(provider: ProviderType) -> Option<String> {
    get_string(api_key_key(provider)).await.filter(|s| !s.is_empty())
}

pub async fn set_api_key(provider: ProviderType, key: &str) {
    set_string(api_key_key(provider), key).await;
}

// --- Sign in with ChatGPT (OAuth) ---

/// The stored OAuth token set for the ChatGPT / OpenAI provider, if signed
/// in. An unreadable value counts as signed out.
pub async fn get_openai_oauth() -> Option<TokenSet> {
    let raw = get_raw(KEY_OPENAI_OAUTH).await;
    if raw.is_undefined() || raw.is_null() {
        return None;
    }
    serde_json::from_value(aipage_bindings::from_js(&raw)).ok()
}

pub async fn save_openai_oauth(tokens: &TokenSet) {
    set_value(KEY_OPENAI_OAUTH, aipage_bindings::to_js(tokens)).await;
}

/// Forget the sign-in (the key is set to `null`; `storage.local.remove` is
/// not part of the bridge surface).
pub async fn clear_openai_oauth() {
    set_value(KEY_OPENAI_OAUTH, JsValue::NULL).await;
}

/// Raw client-id override (may be empty); see `oauth::effective_client_id`.
pub async fn get_openai_oauth_client_id() -> String {
    get_string(KEY_OPENAI_OAUTH_CLIENT_ID).await.unwrap_or_default()
}

pub async fn save_openai_oauth_client_id(id: &str) {
    set_string(KEY_OPENAI_OAUTH_CLIENT_ID, id.trim()).await;
}

// --- local settings (url + model) ---

pub struct LocalSettings {
    pub url: String,
    pub model: String,
}

pub async fn get_local_settings(provider: ProviderType) -> LocalSettings {
    let (url_key, model_key) = local_settings_keys(provider);
    LocalSettings {
        url: get_string(url_key).await.unwrap_or_default(),
        model: get_string(model_key).await.unwrap_or_default(),
    }
}

pub async fn save_local_settings(provider: ProviderType, url: &str, model: &str) {
    let (url_key, model_key) = local_settings_keys(provider);
    let obj = Object::new();
    let _ = Reflect::set(&obj, &JsValue::from_str(url_key), &JsValue::from_str(url));
    let _ = Reflect::set(&obj, &JsValue::from_str(model_key), &JsValue::from_str(model));
    let _ = storage::local_set(obj.as_ref()).await;
}

// --- theme ---

pub async fn get_theme_preference() -> String {
    get_string(KEY_THEME).await.unwrap_or_else(|| "default".to_string())
}

pub async fn save_theme_preference(theme: &str) {
    set_string(KEY_THEME, theme).await;
}

// --- language ---

pub async fn get_language() -> String {
    get_string(KEY_LANGUAGE).await.unwrap_or_else(|| "sk".to_string())
}

pub async fn set_language(lang: &str) {
    set_string(KEY_LANGUAGE, lang).await;
}

// --- image generation ---

pub async fn get_image_gen_enabled() -> bool {
    get_bool(KEY_IMAGE_GEN_ENABLED).await
}

pub async fn save_image_gen_enabled(enabled: bool) {
    set_bool(KEY_IMAGE_GEN_ENABLED, enabled).await;
}

/// `"ollama-svg"` or `"sdwebui"`, defaulting to `ollama-svg`. A stored legacy
/// `"claude-svg"` value is treated as the svg path.
pub async fn get_image_gen_provider() -> String {
    match get_string(KEY_IMAGE_GEN_PROVIDER).await.as_deref() {
        Some("sdwebui") => "sdwebui".to_string(),
        Some("ollama-svg") => "ollama-svg".to_string(),
        // legacy "claude-svg" or anything else → svg path
        _ => "ollama-svg".to_string(),
    }
}

pub async fn save_image_gen_provider(provider: &str) {
    set_string(KEY_IMAGE_GEN_PROVIDER, provider).await;
}

pub async fn get_image_gen_sd_url() -> String {
    get_string(KEY_IMAGE_GEN_SD_URL).await.unwrap_or_else(|| "http://localhost:7860".to_string())
}

pub async fn save_image_gen_sd_url(url: &str) {
    set_string(KEY_IMAGE_GEN_SD_URL, url).await;
}

pub async fn get_image_gen_model() -> String {
    get_string(KEY_IMAGE_GEN_MODEL).await.unwrap_or_else(|| "gpt-oss:120b-cloud".to_string())
}

pub async fn save_image_gen_model(model: &str) {
    set_string(KEY_IMAGE_GEN_MODEL, model).await;
}

pub async fn get_image_gen_size() -> String {
    get_string(KEY_IMAGE_GEN_SIZE).await.unwrap_or_else(|| "1024x1024".to_string())
}

pub async fn save_image_gen_size(size: &str) {
    set_string(KEY_IMAGE_GEN_SIZE, size).await;
}

// --- exam tools / widgets ---

pub async fn get_auto_answer_enabled() -> bool {
    get_bool(KEY_AUTO_ANSWER_ENABLED).await
}

pub async fn save_auto_answer_enabled(enabled: bool) {
    set_bool(KEY_AUTO_ANSWER_ENABLED, enabled).await;
}

// --- appearance / updates ---

/// Whether the sidebar theme is also applied to the EduPage page.
pub async fn get_global_theme_enabled() -> bool {
    get_bool(KEY_GLOBAL_THEME).await
}

pub async fn save_global_theme_enabled(enabled: bool) {
    set_bool(KEY_GLOBAL_THEME, enabled).await;
}

/// Whether the background update check is enabled.
pub async fn get_auto_update_enabled() -> bool {
    get_bool(KEY_AUTO_UPDATE).await
}

pub async fn save_auto_update_enabled(enabled: bool) {
    set_bool(KEY_AUTO_UPDATE, enabled).await;
}

/// Release channel the update manager follows (`stable` by default).
pub async fn get_update_channel() -> UpdateChannel {
    UpdateChannel::from_str_or_default(&get_string(KEY_UPDATE_CHANNEL).await.unwrap_or_default())
}

pub async fn save_update_channel(channel: UpdateChannel) {
    set_string(KEY_UPDATE_CHANNEL, channel.as_str()).await;
}

/// Whether the sidebar UI bundle is downloaded from GitHub releases into
/// IndexedDB. Defaults to `false`.
pub async fn get_ui_bundle_update_enabled() -> bool {
    get_bool(KEY_UI_BUNDLE_UPDATE_ENABLED).await
}

pub async fn save_ui_bundle_update_enabled(enabled: bool) {
    set_bool(KEY_UI_BUNDLE_UPDATE_ENABLED, enabled).await;
}

/// Commit sha of the last extension update the user was notified about.
pub async fn get_update_notified_sha() -> Option<String> {
    get_string(KEY_UPDATE_NOTIFIED_SHA).await.filter(|s| !s.is_empty())
}

pub async fn save_update_notified_sha(sha: &str) {
    set_string(KEY_UPDATE_NOTIFIED_SHA, sha).await;
}

// --- hosted (remote) UI ---

/// Whether the auto-updating hosted UI is used. Defaults to `true`.
pub async fn get_remote_ui_enabled() -> bool {
    get_raw(KEY_REMOTE_UI_ENABLED).await.as_bool().unwrap_or(true)
}

pub async fn save_remote_ui_enabled(enabled: bool) {
    set_bool(KEY_REMOTE_UI_ENABLED, enabled).await;
}

/// Raw stored URL override (may be empty); see `remote_ui::effective_remote_ui_url`.
pub async fn get_remote_ui_url() -> String {
    get_string(KEY_REMOTE_UI_URL).await.unwrap_or_default()
}

pub async fn save_remote_ui_url(url: &str) {
    set_string(KEY_REMOTE_UI_URL, url.trim()).await;
}

pub async fn get_widget_notes() -> String {
    get_string(KEY_WIDGET_NOTES).await.unwrap_or_default()
}

pub async fn save_widget_notes(notes: &str) {
    set_string(KEY_WIDGET_NOTES, notes).await;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn storage_keys_are_the_persisted_contract() {
        assert_eq!(api_key_key(ProviderType::OllamaCloud), "ollama_cloud_api_key");
        assert_eq!(api_key_key(ProviderType::OpenRouter), "openrouter_api_key");
        assert_eq!(api_key_key(ProviderType::OpenAi), "openai_api_key");
        // the keys the pre-Ollama Claude builds wrote; old installs must find their key again
        assert_eq!(api_key_key(ProviderType::Anthropic), "anthropic_api_key");
        assert_eq!(local_settings_keys(ProviderType::Anthropic), ("anthropic_base_url", "anthropic_model"));
        assert_eq!(api_key_key(ProviderType::Lmstudio), "lmstudio_api_key");
        assert_eq!(api_key_key(ProviderType::Ollama), "ollama_api_key");
        assert_eq!(local_settings_keys(ProviderType::OpenRouter), ("openrouter_base_url", "openrouter_model"));
        assert_eq!(local_settings_keys(ProviderType::OpenAi), ("openai_base_url", "openai_model"));
        assert_eq!(local_settings_keys(ProviderType::OllamaCloud), ("ollama_cloud_base_url", "ollama_cloud_model"));
    }
}
