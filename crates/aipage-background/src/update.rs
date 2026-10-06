//! Auto-update manager (GitHub Releases).
//!
//! Every hour (and on demand from the settings view) the background reads the
//! release of the selected channel through the unauthenticated GitHub REST
//! API — `releases/latest` for **stable**, `releases/tags/nightly` for
//! **nightly** (60 requests/hour per IP, one check per hour) — and:
//!
//! 1. when *Auto-update* is on and the release's extension package is newer
//!    than the installed one (rule: `aipage_core::updates::extension_update_available`),
//!    shows a notification whose click downloads the browser's package
//!    (`aipage-chrome.zip` / `aipage-firefox.xpi` / `aipage-safari*.zip`,
//!    matched by prefix) through `chrome.downloads`;
//! 2. when *Update the sidebar from GitHub releases* is on, keeps the sidebar
//!    UI bundle in IndexedDB in sync with the release (see [`crate::ui_bundle`]).
//!
//! A 404 (no release on the channel yet) is "nothing to update to"; a rate
//! limit (403/429 with `x-ratelimit-remaining: 0`) is logged once and retried
//! on the next alarm.

use std::cell::Cell;

use js_sys::{Function, Reflect};
use serde_json::{json, Value};
use wasm_bindgen::prelude::*;

use aipage_bindings::{alarms, downloads, js_object, notifications};
use aipage_core::storage;
use aipage_core::updates::{self, Browser, RemoteExtension, UpdateChannel};

use crate::ui_bundle;

const UPDATE_CHECK_ALARM: &str = "check_updates";
const NOTIFICATION_ID: &str = "update-available";
const CHECK_INTERVAL_MINUTES: f64 = 60.0;

thread_local! {
    /// Set once a rate-limit response was logged, so the hourly check does
    /// not repeat the same warning until a request succeeds again.
    static RATE_LIMIT_LOGGED: Cell<bool> = const { Cell::new(false) };
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

fn manifest_str(key: &str) -> Option<String> {
    Reflect::get(&get_manifest(), &JsValue::from_str(key)).ok().and_then(|v| v.as_string())
}

/// The installed extension's manifest `version`.
pub(crate) fn current_version() -> String {
    manifest_str("version").unwrap_or_default()
}

/// Commit of a nightly install, from Chrome's `version_name` (`None` elsewhere).
fn installed_sha() -> Option<String> {
    manifest_str("version_name").and_then(|n| updates::sha_from_version_name(&n).map(str::to_string))
}

fn browser() -> Browser {
    let ua = web_sys::window().and_then(|w| w.navigator().user_agent().ok()).unwrap_or_default();
    Browser::from_user_agent(&ua)
}

/// Fetch the channel's release object from the GitHub API.
pub(crate) async fn fetch_release(channel: UpdateChannel) -> Result<Value, String> {
    let result = crate::fetch_github_json(&channel.release_api_url()).await;
    match &result {
        Err(e) if e.contains("rate limit") => {
            if !RATE_LIMIT_LOGGED.replace(true) {
                aipage_bindings::console::warn(format!("[AIPage] update check: {e}; retrying on the next hourly check"));
            }
        }
        Ok(_) => RATE_LIMIT_LOGGED.set(false),
        Err(_) => {}
    }
    result
}

/// What the channel offers for the extension package. On the nightly
/// channel the tag is just `nightly`, so the version and commit come from
/// the `nightly.json` asset.
async fn remote_extension(channel: UpdateChannel, release: &Value) -> Option<RemoteExtension> {
    if channel == UpdateChannel::Nightly {
        let assets = updates::release_assets(release);
        if let Some(asset) = updates::find_asset(&assets, updates::NIGHTLY_JSON_ASSET) {
            match crate::fetch_json(&asset.browser_download_url).await {
                Ok(v) => {
                    if let Some(r) = updates::parse_nightly_json(&v) {
                        return Some(r);
                    }
                }
                Err(e) => aipage_bindings::console::warn(format!("[AIPage] nightly.json unreadable: {e}")),
            }
        }
    }
    updates::release_version(release).map(|version| RemoteExtension { version, sha: None })
}

/// Show the "update available" notification. Clicking it downloads the
/// package; on Chromium it also gets Download / Dismiss buttons and stays
/// until dismissed. Firefox's and Safari's `notifications.create` schemas
/// reject `buttons` and `requireInteraction` (the call throws), so those
/// options are only passed on Chromium-based browsers.
fn notify_update_available(version: &str) {
    let mut opts = vec![
        ("type", JsValue::from_str("basic")),
        ("iconUrl", JsValue::from_str("assets/icon-128.png")),
        ("title", JsValue::from_str(&format!("AIPage Update Available ({version})"))),
        ("message", JsValue::from_str("A new version is available. Click to download.")),
    ];
    if browser() == Browser::Chrome {
        let buttons = js_sys::Array::new();
        buttons.push(&js_object(&[("title", JsValue::from_str("Download"))]));
        buttons.push(&js_object(&[("title", JsValue::from_str("Dismiss"))]));
        opts.push(("buttons", buttons.into()));
        opts.push(("requireInteraction", JsValue::TRUE));
    }
    notifications::create(NOTIFICATION_ID, &js_object(&opts));
}

fn trigger_download() {
    wasm_bindgen_futures::spawn_local(async move {
        let channel = storage::get_update_channel().await;
        let release = match fetch_release(channel).await {
            Ok(v) => v,
            Err(e) => {
                aipage_bindings::console::error(format!("Update download failed: {e}"));
                notifications::clear(NOTIFICATION_ID);
                return;
            }
        };
        let assets = updates::release_assets(&release);
        let Some(asset) = updates::matching_package(&assets, browser()) else {
            aipage_bindings::console::error(format!(
                "No {} asset in the {} release; open {}/{}/releases to download manually",
                browser().package_prefix(),
                channel.as_str(),
                updates::WEB_BASE,
                updates::REPO
            ));
            notifications::clear(NOTIFICATION_ID);
            return;
        };
        let opts = js_object(&[
            ("url", JsValue::from_str(&asset.browser_download_url)),
            ("filename", JsValue::from_str(&asset.name)),
        ]);
        let _ = downloads::download(&opts).await;
        notifications::clear(NOTIFICATION_ID);
    });
}

/// Run the extension-package check and the UI-bundle sync against the
/// channel's release. `manual` (settings "Check now") runs the extension
/// check even with *Auto-update* off. Returns the report the settings view
/// renders:
///
/// ```json
/// { "ok": true, "channel": "stable",
///   "extension": { "current": "1.7.0", "remote": "1.8.0", "updateAvailable": true },
///   "uiBundle": { "enabled": true, "result": "installed", "version": "1.8.0", "installed": { ...meta } } }
/// ```
pub(crate) async fn check_updates(manual: bool) -> Value {
    let auto = storage::get_auto_update_enabled().await;
    let bundle_enabled = storage::get_ui_bundle_update_enabled().await;
    let channel = storage::get_update_channel().await;
    let current = current_version();

    let mut report = json!({
        "ok": true,
        "channel": channel.as_str(),
        "extension": { "current": current, "remote": Value::Null, "updateAvailable": false },
        "uiBundle": { "enabled": bundle_enabled, "result": if bundle_enabled { "not_checked" } else { "disabled" } },
    });

    // A download that is older than the extension's own sidebar can never be
    // used (see `updates::ui_source`); drop it so the status stays honest.
    if let Some(meta) = ui_bundle::installed_meta().await {
        if updates::compare_versions(&meta.version, &current) < 0 {
            aipage_bindings::console::log(format!(
                "[AIPage] discarding UI bundle {} (older than the installed extension {current})",
                meta.version
            ));
            let _ = ui_bundle::clear().await;
        }
    }

    if !manual && !auto && !bundle_enabled {
        report["uiBundle"]["result"] = json!("disabled");
        return report;
    }

    let release = match fetch_release(channel).await {
        Ok(v) => v,
        Err(e) => {
            if !e.contains("404") && !e.contains("rate limit") {
                aipage_bindings::console::error(format!("Update check failed: {e}"));
            }
            report["ok"] = json!(false);
            report["error"] = json!(e);
            return report;
        }
    };

    if manual || auto {
        if let Some(remote) = remote_extension(channel, &release).await {
            let notified = storage::get_update_notified_sha().await;
            let available = updates::extension_update_available(
                channel,
                &remote,
                &current,
                installed_sha().as_deref(),
                notified.as_deref(),
            );
            report["extension"]["remote"] = json!(remote.version);
            report["extension"]["updateAvailable"] = json!(available);
            if available {
                aipage_bindings::console::log(format!(
                    "Update available on the {} channel: {} (current: {current})",
                    channel.as_str(),
                    remote.version
                ));
                notify_update_available(&remote.version);
                if let Some(sha) = &remote.sha {
                    storage::save_update_notified_sha(sha).await;
                }
            }
        }
    }

    if bundle_enabled {
        report["uiBundle"] = match ui_bundle::sync(channel, &release, &current).await {
            Ok(outcome) => outcome,
            Err(e) => {
                aipage_bindings::console::error(format!("[AIPage] UI bundle update failed: {e}"));
                json!({ "enabled": true, "result": "error", "error": e })
            }
        };
        report["uiBundle"]["enabled"] = json!(true);
    }
    report["uiBundle"]["installed"] = ui_bundle::installed_meta().await.map(|m| m.to_json()).unwrap_or(Value::Null);
    report
}

/// Register the periodic alarm, notification handlers, and run an initial check.
pub fn init_update_manager() {
    let info = js_object(&[("periodInMinutes", JsValue::from_f64(CHECK_INTERVAL_MINUTES))]);
    alarms::create(UPDATE_CHECK_ALARM, &info);

    alarms::on_alarm(|alarm| {
        if Reflect::get(&alarm, &"name".into()).ok().and_then(|v| v.as_string()).as_deref()
            == Some(UPDATE_CHECK_ALARM)
        {
            wasm_bindgen_futures::spawn_local(async {
                check_updates(false).await;
            });
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

    wasm_bindgen_futures::spawn_local(async {
        check_updates(false).await;
    });
}
