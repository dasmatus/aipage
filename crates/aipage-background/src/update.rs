//! Auto-update manager.
//!
//! Periodically checks the Codeberg (Forgejo) repository for a newer
//! **release** and, if found, shows a notification that downloads the matching
//! browser asset on click. The version is read from the latest release's
//! `tag_name`, and the download is the release asset whose name matches the
//! current browser (`aipage-chrome.zip` / `aipage-firefox.xpi` /
//! `aipage-safari.zip`).

use js_sys::{Function, Reflect};
use serde_json::Value;
use wasm_bindgen::prelude::*;

use aipage_bindings::{alarms, downloads, js_object, notifications};
use aipage_core::storage;

const UPDATE_CHECK_ALARM: &str = "check_updates";
const NOTIFICATION_ID: &str = "update-available";
const CHECK_INTERVAL_MINUTES: f64 = 60.0;
/// Forgejo web base, used for logging the release URL.
const FORGEJO_BASE: &str = "https://codeberg.org";
/// Forgejo REST API base.
const API_BASE: &str = "https://codeberg.org/api/v1";
/// `owner/repo` of the published extension.
const REPO: &str = "dasmatus/aipage";

#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(js_namespace = ["chrome", "runtime"], js_name = getManifest)]
    fn get_manifest() -> JsValue;
    #[wasm_bindgen(js_namespace = ["chrome", "notifications", "onClicked"], js_name = addListener)]
    fn notif_on_clicked(cb: &Function);
    #[wasm_bindgen(js_namespace = ["chrome", "notifications", "onButtonClicked"], js_name = addListener)]
    fn notif_on_button_clicked(cb: &Function);
}

/// Compare dotted version strings component-wise (missing components count
/// as 0). Returns 1 / -1 / 0.
pub(crate) fn compare_versions(v1: &str, v2: &str) -> i32 {
    let p1: Vec<u64> = v1.split('.').map(|s| s.parse().unwrap_or(0)).collect();
    let p2: Vec<u64> = v2.split('.').map(|s| s.parse().unwrap_or(0)).collect();
    (0..p1.len().max(p2.len()))
        .map(|i| (p1.get(i).copied().unwrap_or(0), p2.get(i).copied().unwrap_or(0)))
        .find(|(a, b)| a != b)
        .map_or(0, |(a, b)| if a > b { 1 } else { -1 })
}

#[derive(Clone, Copy)]
enum BrowserType {
    Chrome,
    Firefox,
    Safari,
}

fn browser_type() -> BrowserType {
    let ua = web_sys::window()
        .and_then(|w| w.navigator().user_agent().ok())
        .unwrap_or_default()
        .to_lowercase();
    if ua.contains("firefox") {
        BrowserType::Firefox
    } else if ua.contains("safari") && !ua.contains("chrome") {
        BrowserType::Safari
    } else {
        BrowserType::Chrome
    }
}

/// Substring matched (case-insensitively) against a release asset's filename
/// to pick the right build for the current browser.
fn asset_name_fragment(b: BrowserType) -> &'static str {
    match b {
        BrowserType::Chrome => "chrome",
        BrowserType::Firefox => "firefox",
        BrowserType::Safari => "safari",
    }
}

/// Fetch the latest Forgejo release (`GET /repos/{owner}/{repo}/releases/latest`).
async fn latest_release() -> Result<Value, String> {
    crate::fetch_json(&format!("{API_BASE}/repos/{REPO}/releases/latest")).await
}

/// Find the download URL + filename of the asset matching the current browser
/// in the given release object.
fn matching_asset(release: &Value) -> Option<(String, String)> {
    let target = asset_name_fragment(browser_type());
    release
        .get("assets")
        .and_then(Value::as_array)?
        .iter()
        .find_map(|a| {
            let name = a.get("name").and_then(Value::as_str).unwrap_or("");
            if name.to_lowercase().contains(target) {
                let url = a.get("browser_download_url").and_then(Value::as_str)?;
                Some((url.to_string(), name.to_string()))
            } else {
                None
            }
        })
}

fn current_version() -> String {
    Reflect::get(&get_manifest(), &"version".into())
        .ok()
        .and_then(|v| v.as_string())
        .unwrap_or_default()
}

/// Show the "update available" notification with Download / Dismiss buttons.
fn notify_update_available(version: &str) {
    let buttons = js_sys::Array::new();
    buttons.push(&js_object(&[("title", JsValue::from_str("Download"))]));
    buttons.push(&js_object(&[("title", JsValue::from_str("Dismiss"))]));
    let opts = js_object(&[
        ("type", JsValue::from_str("basic")),
        ("iconUrl", JsValue::from_str("assets/icon-128.png")),
        ("title", JsValue::from_str(&format!("AIPage Update Available ({version})"))),
        ("message", JsValue::from_str("A new version is available. Click to download.")),
        ("buttons", buttons.into()),
        ("requireInteraction", JsValue::TRUE),
    ]);
    notifications::create(NOTIFICATION_ID, &opts);
}

fn trigger_download() {
    wasm_bindgen_futures::spawn_local(async move {
        let release = match latest_release().await {
            Ok(v) => v,
            Err(e) => {
                aipage_bindings::console::error(format!("Update download failed: {e}"));
                notifications::clear(NOTIFICATION_ID);
                return;
            }
        };
        let (url, filename) = match matching_asset(&release) {
            Some(pair) => pair,
            None => {
                let target = asset_name_fragment(browser_type());
                aipage_bindings::console::error(format!(
                    "No {target} asset in latest release; open {FORGEJO_BASE}/{REPO}/releases to download manually"
                ));
                notifications::clear(NOTIFICATION_ID);
                return;
            }
        };
        let opts = js_object(&[
            ("url", JsValue::from_str(&url)),
            ("filename", JsValue::from_str(&filename)),
        ]);
        let _ = downloads::download(&opts).await;
        notifications::clear(NOTIFICATION_ID);
    });
}

/// Check the Forgejo repo for a newer release when auto-update is enabled.
/// A 404 (no published release yet) is "nothing to update to", not an error.
async fn check_updates() {
    if !storage::get_auto_update_enabled().await {
        return;
    }

    let release = match latest_release().await {
        Ok(v) => v,
        Err(e) => {
            if !e.contains("404") {
                aipage_bindings::console::error(format!("Update check failed: {e}"));
            }
            return;
        }
    };

    let tag = release.get("tag_name").and_then(Value::as_str).unwrap_or("");
    let remote_version = tag.trim_start_matches('v');
    let current = current_version();

    if compare_versions(remote_version, &current) > 0 {
        aipage_bindings::console::log(format!(
            "Update available: {remote_version} (current: {current})"
        ));
        notify_update_available(remote_version);
    }
}

/// Register the periodic alarm, notification handlers, and run an initial check.
pub fn init_update_manager() {
    let info = js_object(&[("periodInMinutes", JsValue::from_f64(CHECK_INTERVAL_MINUTES))]);
    alarms::create(UPDATE_CHECK_ALARM, &info);

    alarms::on_alarm(|alarm| {
        if Reflect::get(&alarm, &"name".into()).ok().and_then(|v| v.as_string()).as_deref()
            == Some(UPDATE_CHECK_ALARM)
        {
            wasm_bindgen_futures::spawn_local(check_updates());
        }
    });

    // Download on notification click / "Download" button.
    let on_click = Closure::wrap(Box::new(move |id: JsValue| {
        if id.as_string().as_deref() == Some(NOTIFICATION_ID) {
            trigger_download();
        }
    }) as Box<dyn Fn(JsValue)>);
    notif_on_clicked(on_click.as_ref().unchecked_ref());
    on_click.forget();

    let on_button = Closure::wrap(Box::new(move |id: JsValue, button_index: JsValue| {
        if id.as_string().as_deref() == Some(NOTIFICATION_ID)
            && button_index.as_f64() == Some(0.0)
        {
            trigger_download();
        }
    }) as Box<dyn Fn(JsValue, JsValue)>);
    notif_on_button_clicked(on_button.as_ref().unchecked_ref());
    on_button.forget();

    wasm_bindgen_futures::spawn_local(check_updates());
}

#[cfg(test)]
mod tests {
    use super::compare_versions;

    #[test]
    fn compares_semver() {
        assert_eq!(compare_versions("1.8.0", "1.7.0"), 1);
        assert_eq!(compare_versions("1.7.0", "1.7.1"), -1);
        assert_eq!(compare_versions("1.7.0", "1.7.0"), 0);
        assert_eq!(compare_versions("2.0", "1.9.9"), 1);
        assert_eq!(compare_versions("1.7", "1.7.0"), 0);
    }
}
