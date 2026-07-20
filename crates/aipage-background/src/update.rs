//! Auto-update manager. Mirrors `src/update-manager.ts`.
//!
//! Periodically checks the Codeberg (Forgejo) repository for a newer **release**
//! and, if found, shows a notification that downloads the matching browser
//! asset on click. Maps the old GitLab CI-artifact flow onto Forgejo Releases:
//! the version is read from the latest release's `tag_name`, and the download
//! is the release asset whose name matches the current browser
//! (`aipage-chrome.zip` / `aipage-firefox.xpi` / `aipage-safari.zip`).

use std::cell::RefCell;

use js_sys::{Function, Reflect};
use serde_json::Value;
use wasm_bindgen::prelude::*;

use aipage_bindings::{alarms, downloads, notifications, storage};

const UPDATE_CHECK_ALARM: &str = "check_updates";
const CHECK_INTERVAL_MINUTES: f64 = 60.0;
/// Forgejo web base, used for logging the release URL.
const FORGEJO_BASE: &str = "https://codeberg.org";
/// Forgejo REST API base.
const API_BASE: &str = "https://codeberg.org/api/v1";
/// `owner/repo` of the published extension.
const REPO: &str = "dasmatus/aipage";

thread_local! {
    /// Version offered by the most recent "update available" notification.
    static PENDING_VERSION: RefCell<Option<String>> = const { RefCell::new(None) };
}

#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(js_namespace = ["chrome", "runtime"], js_name = getManifest)]
    fn get_manifest() -> JsValue;
    #[wasm_bindgen(js_namespace = ["chrome", "notifications", "onClicked"], js_name = addListener)]
    fn notif_on_clicked(cb: &Function);
    #[wasm_bindgen(js_namespace = ["chrome", "notifications", "onButtonClicked"], js_name = addListener)]
    fn notif_on_button_clicked(cb: &Function);
}

/// Compare dotted version strings. Returns 1 / -1 / 0 like the TS `compareVersions`.
pub(crate) fn compare_versions(v1: &str, v2: &str) -> i32 {
    let p1: Vec<u64> = v1.split('.').map(|s| s.parse().unwrap_or(0)).collect();
    let p2: Vec<u64> = v2.split('.').map(|s| s.parse().unwrap_or(0)).collect();
    for i in 0..p1.len().max(p2.len()) {
        let n1 = p1.get(i).copied().unwrap_or(0);
        let n2 = p2.get(i).copied().unwrap_or(0);
        if n1 > n2 {
            return 1;
        }
        if n1 < n2 {
            return -1;
        }
    }
    0
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

async fn auto_update_enabled() -> bool {
    let keys = js_sys::Array::of1(&JsValue::from_str("autoUpdate"));
    match storage::local_get(keys.as_ref()).await {
        Ok(result) => Reflect::get(&result, &"autoUpdate".into())
            .ok()
            .and_then(|v| v.as_bool())
            .unwrap_or(false),
        Err(_) => false,
    }
}

fn notify(id: &str, title: &str, message: &str, with_buttons: bool) {
    let opts = js_sys::Object::new();
    let set = |k: &str, v: &JsValue| {
        let _ = Reflect::set(&opts, &JsValue::from_str(k), v);
    };
    set("type", &JsValue::from_str("basic"));
    set("iconUrl", &JsValue::from_str("assets/icon-128.png"));
    set("title", &JsValue::from_str(title));
    set("message", &JsValue::from_str(message));
    if with_buttons {
        let buttons = js_sys::Array::new();
        buttons.push(&crate::obj(&[("title", JsValue::from_str("Download"))]));
        buttons.push(&crate::obj(&[("title", JsValue::from_str("Dismiss"))]));
        set("buttons", &buttons);
        set("requireInteraction", &JsValue::TRUE);
    }
    notifications::create(id, opts.as_ref());
}

fn trigger_download() {
    wasm_bindgen_futures::spawn_local(async move {
        let release = match latest_release().await {
            Ok(v) => v,
            Err(e) => {
                aipage_bindings::console::error(format!("Update download failed: {e}"));
                notifications::clear("update-available");
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
                notifications::clear("update-available");
                return;
            }
        };
        let opts = crate::obj(&[
            ("url", JsValue::from_str(&url)),
            ("filename", JsValue::from_str(&filename)),
        ]);
        let _ = downloads::download(&opts).await;
        notifications::clear("update-available");
    });
}

/// Check the Forgejo repo for a newer release. `manual` forces a notification
/// either way. A 404 (no published release yet) is treated as "nothing to update
/// to" rather than an error.
pub(crate) async fn check_updates(manual: bool) {
    if !manual && !auto_update_enabled().await {
        return;
    }

    let release = match latest_release().await {
        Ok(v) => v,
        Err(e) => {
            if !e.contains("404") {
                aipage_bindings::console::error(format!("Update check failed: {e}"));
            }
            if manual {
                notify(
                    "no-update",
                    "AIPage is up to date",
                    "No published release was found to update to.",
                    false,
                );
            }
            return;
        }
    };

    let tag = release.get("tag_name").and_then(Value::as_str).unwrap_or("").to_string();
    let remote_version = tag.trim_start_matches('v').to_string();
    let current = current_version();

    if compare_versions(&remote_version, &current) > 0 {
        aipage_bindings::console::log(format!(
            "Update available: {remote_version} (current: {current})"
        ));
        PENDING_VERSION.with(|p| *p.borrow_mut() = Some(remote_version.clone()));
        notify(
            "update-available",
            &format!("AIPage Update Available ({remote_version})"),
            "A new version is available. Click to download.",
            true,
        );
    } else if manual {
        notify(
            "no-update",
            "AIPage is up to date",
            &format!("You are on the latest version ({current})."),
            false,
        );
    }
}

/// Register the periodic alarm, notification handlers, and run an initial check.
pub fn init_update_manager() {
    let info = crate::obj(&[("periodInMinutes", JsValue::from_f64(CHECK_INTERVAL_MINUTES))]);
    alarms::create(UPDATE_CHECK_ALARM, &info);

    alarms::on_alarm(|alarm| {
        if Reflect::get(&alarm, &"name".into()).ok().and_then(|v| v.as_string()).as_deref()
            == Some(UPDATE_CHECK_ALARM)
        {
            wasm_bindgen_futures::spawn_local(check_updates(false));
        }
    });

    // Download on notification click / "Download" button.
    let on_click = Closure::wrap(Box::new(move |id: JsValue| {
        if id.as_string().as_deref() == Some("update-available") {
            trigger_download();
        }
    }) as Box<dyn Fn(JsValue)>);
    notif_on_clicked(on_click.as_ref().unchecked_ref());
    on_click.forget();

    let on_button = Closure::wrap(Box::new(move |id: JsValue, button_index: JsValue| {
        if id.as_string().as_deref() == Some("update-available")
            && button_index.as_f64() == Some(0.0)
        {
            trigger_download();
        }
    }) as Box<dyn Fn(JsValue, JsValue)>);
    notif_on_button_clicked(on_button.as_ref().unchecked_ref());
    on_button.forget();

    wasm_bindgen_futures::spawn_local(check_updates(false));
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
