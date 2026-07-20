//! `browser.storage.local` access. Mirrors `src/sidebar/storage.ts`.
//!
//! Storage key strings are kept identical to the TypeScript build so an
//! existing user's saved settings survive the migration to the Rust extension.

use aipage_bindings::storage;
use js_sys::{Array, Object, Reflect};
use wasm_bindgen::JsValue;

use crate::types::ProviderType;

// --- key constants (must match the old STORAGE_KEYS) ---
const KEY_PROVIDER: &str = "ai_provider";
const KEY_PROVIDER_BACKEND: &str = "providerBackend";
const KEY_THEME: &str = "ai_sidebar_theme";
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
        ProviderType::Anthropic => "anthropic_api_key",
    }
}

/// `(url_key, model_key)` pair for a provider's local settings.
fn local_settings_keys(p: ProviderType) -> (&'static str, &'static str) {
    match p {
        ProviderType::Lmstudio => ("lmstudio_base_url", "lmstudio_model"),
        ProviderType::Ollama => ("ollama_base_url", "ollama_model"),
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

// --- provider preference ---

pub async fn get_provider_preference() -> ProviderType {
    match get_string(KEY_PROVIDER).await.as_deref() {
        Some(s) => ProviderType::from_str_or_default(s),
        None => ProviderType::Anthropic,
    }
}

pub async fn save_provider_preference(p: ProviderType) {
    set_string(KEY_PROVIDER, p.as_str()).await;
}

pub async fn get_provider_backend_preference() -> ProviderType {
    match get_string(KEY_PROVIDER_BACKEND).await.as_deref() {
        Some(s) => ProviderType::from_str_or_default(s),
        None => ProviderType::Anthropic,
    }
}

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

// --- language (from i18n.ts) ---

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
    set_value(KEY_IMAGE_GEN_ENABLED, JsValue::from_bool(enabled)).await;
}

/// `"claude-svg"` or `"sdwebui"`, defaulting to `claude-svg`.
pub async fn get_image_gen_provider() -> String {
    match get_string(KEY_IMAGE_GEN_PROVIDER).await.as_deref() {
        Some("sdwebui") => "sdwebui".to_string(),
        _ => "claude-svg".to_string(),
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
    get_string(KEY_IMAGE_GEN_MODEL).await.unwrap_or_else(|| "claude-opus-4-8".to_string())
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
    set_value(KEY_AUTO_ANSWER_ENABLED, JsValue::from_bool(enabled)).await;
}

pub async fn get_widget_notes() -> String {
    get_string(KEY_WIDGET_NOTES).await.unwrap_or_default()
}

pub async fn save_widget_notes(notes: &str) {
    set_string(KEY_WIDGET_NOTES, notes).await;
}
