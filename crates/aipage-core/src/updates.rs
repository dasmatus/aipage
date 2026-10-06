//! Update logic shared by the background update manager, the settings view
//! and (as documentation) `assets/sidebar_loader.js`: release channels,
//! version comparison, release-asset matching, the `aipage-web.json` bundle
//! manifest and the precedence between the three sidebar UI sources.
//!
//! Everything here is pure so it is unit-tested natively; the browser side
//! (fetching, `storage.local`, IndexedDB, notifications) lives in
//! `aipage-background`.
//!
//! # Release layout (GitHub)
//!
//! Releases are published at `https://github.com/dasmatus/aipage/releases`:
//!
//! - **stable**: tagged `vX.Y.Z` by `release.yml`, read through
//!   `GET /repos/{repo}/releases/latest`;
//! - **nightly**: the rolling prerelease tagged `nightly` by `nightly.yml`,
//!   read through `GET /repos/{repo}/releases/tags/nightly`. Its manifest
//!   version is `<base>.<YYYYMMDD>` and it carries a `nightly.json` asset with
//!   the built commit.
//!
//! Every release carries the three browser packages, plus the hosted sidebar
//! bundle as `aipage-web.zip` and its hash manifest `aipage-web.json` (listing
//! every file of `dist-web/` with its sha256). The individual web files are
//! uploaded as release assets too, so the extension can download them one by
//! one without unpacking a zip in wasm.
//!
//! # Version rule
//!
//! Versions are compared component-wise as unsigned integers, missing
//! components counting as 0, so a nightly `1.7.0.20261006` sorts above the
//! `1.7.0` release it is built from and below `1.7.1`; a later date is newer.
//! On the nightly channel two builds can share a version (same day rebuild,
//! or a forced run), so a same-version candidate counts as newer when its
//! commit `sha` differs from the installed one (see [`bundle_is_newer`] and
//! [`extension_update_available`]).

use serde::Deserialize;
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;

/// `owner/repo` of the published extension on GitHub.
pub const REPO: &str = "dasmatus/aipage";
/// GitHub REST API base.
pub const API_BASE: &str = "https://api.github.com";
/// GitHub web base, used for log messages that point at the releases page.
pub const WEB_BASE: &str = "https://github.com";
/// Tag of the rolling nightly prerelease.
pub const NIGHTLY_TAG: &str = "nightly";

/// Release asset holding the hash manifest of the hosted sidebar bundle.
pub const WEB_MANIFEST_ASSET: &str = "aipage-web.json";
/// Release asset holding the whole `dist-web/` directory.
pub const WEB_ZIP_ASSET: &str = "aipage-web.zip";
/// Nightly-only asset with the built commit.
pub const NIGHTLY_JSON_ASSET: &str = "nightly.json";

/// `storage.local` key: `"stable"` (default) or `"nightly"`.
pub const KEY_UPDATE_CHANNEL: &str = "update_channel";
/// `storage.local` key: `bool`, whether the sidebar UI bundle is downloaded
/// from GitHub releases into IndexedDB. Absent means **off**.
pub const KEY_UI_BUNDLE_UPDATE_ENABLED: &str = "ui_bundle_update_enabled";
/// `storage.local` key: commit sha of the last extension update the user was
/// notified about (nightly channel: avoids re-notifying the same rebuild).
pub const KEY_UPDATE_NOTIFIED_SHA: &str = "update_notified_sha";

/// IndexedDB database/store names (extension origin) holding the downloaded
/// sidebar bundle. Mirrored verbatim in `assets/sidebar_loader.js`.
pub const UI_BUNDLE_DB: &str = "aipage-ui-bundle";
pub const UI_BUNDLE_STORE: &str = "ui-bundle";
/// Key of the metadata record inside [`UI_BUNDLE_STORE`].
pub const UI_BUNDLE_META_KEY: &str = "meta";

/// Which GitHub release the update manager follows.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Default)]
pub enum UpdateChannel {
    #[default]
    Stable,
    Nightly,
}

impl UpdateChannel {
    /// The persisted string (also the `<select>` value in settings).
    pub fn as_str(self) -> &'static str {
        match self {
            UpdateChannel::Stable => "stable",
            UpdateChannel::Nightly => "nightly",
        }
    }

    /// Parse the persisted string; anything unknown is `Stable`.
    pub fn from_str_or_default(s: &str) -> Self {
        match s.trim() {
            "nightly" => UpdateChannel::Nightly,
            _ => UpdateChannel::Stable,
        }
    }

    /// GitHub REST endpoint of the channel's release object.
    pub fn release_api_url(self) -> String {
        match self {
            UpdateChannel::Stable => format!("{API_BASE}/repos/{REPO}/releases/latest"),
            UpdateChannel::Nightly => format!("{API_BASE}/repos/{REPO}/releases/tags/{NIGHTLY_TAG}"),
        }
    }
}

/// Compare dotted version strings component-wise (missing components count
/// as 0, non-numeric components as 0). Returns 1 / -1 / 0.
pub fn compare_versions(v1: &str, v2: &str) -> i32 {
    let p1: Vec<u64> = v1.trim().split('.').map(|s| s.parse().unwrap_or(0)).collect();
    let p2: Vec<u64> = v2.trim().split('.').map(|s| s.parse().unwrap_or(0)).collect();
    (0..p1.len().max(p2.len()))
        .map(|i| (p1.get(i).copied().unwrap_or(0), p2.get(i).copied().unwrap_or(0)))
        .find(|(a, b)| a != b)
        .map_or(0, |(a, b)| if a > b { 1 } else { -1 })
}

/// Strip a leading `v` from a release tag (`v1.8.0` → `1.8.0`).
pub fn version_from_tag(tag: &str) -> &str {
    tag.trim().trim_start_matches(['v', 'V'])
}

/// The commit a nightly build was made from, as encoded in Chrome's
/// `version_name` (`1.7.0-nightly.20261006+abc1234` → `abc1234`). `None` for
/// release builds and on browsers that drop `version_name`.
pub fn sha_from_version_name(version_name: &str) -> Option<&str> {
    let (_, sha) = version_name.split_once('+')?;
    let sha = sha.trim();
    (!sha.is_empty() && sha.chars().all(|c| c.is_ascii_hexdigit())).then_some(sha)
}

/// Two commit shas denote the same commit when one is a prefix of the other
/// (short vs. full form). Empty shas never match.
pub fn same_commit(a: &str, b: &str) -> bool {
    let (a, b) = (a.trim().to_ascii_lowercase(), b.trim().to_ascii_lowercase());
    !a.is_empty() && !b.is_empty() && (a.starts_with(&b) || b.starts_with(&a))
}

/// Browser flavour used to pick the matching release package.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Browser {
    Chrome,
    Firefox,
    Safari,
}

impl Browser {
    /// Classify a user-agent string.
    pub fn from_user_agent(ua: &str) -> Self {
        let ua = ua.to_ascii_lowercase();
        if ua.contains("firefox") {
            Browser::Firefox
        } else if ua.contains("safari") && !ua.contains("chrome") && !ua.contains("chromium") {
            Browser::Safari
        } else {
            Browser::Chrome
        }
    }

    /// Canonical package name (`aipage-chrome.zip`, `aipage-firefox.xpi`,
    /// `aipage-safari.zip`).
    pub fn package_name(self) -> &'static str {
        match self {
            Browser::Chrome => "aipage-chrome.zip",
            Browser::Firefox => "aipage-firefox.xpi",
            Browser::Safari => "aipage-safari.zip",
        }
    }

    /// Prefix every acceptable package name starts with (`aipage-safari`
    /// also matches a future `aipage-safari-macos.zip`).
    pub fn package_prefix(self) -> &'static str {
        match self {
            Browser::Chrome => "aipage-chrome",
            Browser::Firefox => "aipage-firefox",
            Browser::Safari => "aipage-safari",
        }
    }
}

/// A release asset as the GitHub API lists it.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Asset {
    pub name: String,
    pub browser_download_url: String,
}

/// The `assets` array of a GitHub release object.
pub fn release_assets(release: &Value) -> Vec<Asset> {
    release
        .get("assets")
        .and_then(Value::as_array)
        .map(|arr| {
            arr.iter()
                .filter_map(|a| {
                    Some(Asset {
                        name: a.get("name")?.as_str()?.to_string(),
                        browser_download_url: a.get("browser_download_url")?.as_str()?.to_string(),
                    })
                })
                .collect()
        })
        .unwrap_or_default()
}

/// The asset with exactly this name.
pub fn find_asset<'a>(assets: &'a [Asset], name: &str) -> Option<&'a Asset> {
    assets.iter().find(|a| a.name == name)
}

/// The browser package to download: the canonical name when present, else
/// the first asset whose name starts with the browser's prefix
/// (case-insensitive), so `aipage-safari-macos.zip` is found as well.
pub fn matching_package(assets: &[Asset], browser: Browser) -> Option<&Asset> {
    find_asset(assets, browser.package_name()).or_else(|| {
        let prefix = browser.package_prefix();
        assets.iter().find(|a| a.name.to_ascii_lowercase().starts_with(prefix))
    })
}

/// `tag_name` of a release object, version-stripped.
pub fn release_version(release: &Value) -> Option<String> {
    let tag = release.get("tag_name")?.as_str()?;
    let v = version_from_tag(tag);
    (!v.is_empty()).then(|| v.to_string())
}

/// `published_at` of a release object (RFC 3339), if present.
pub fn release_published_at(release: &Value) -> Option<String> {
    release.get("published_at").and_then(Value::as_str).map(str::to_string)
}

/// What the channel offers for the *extension package*: its version and, when
/// known (nightly: `nightly.json`), the commit it was built from.
#[derive(Clone, Debug, PartialEq, Eq, Default)]
pub struct RemoteExtension {
    pub version: String,
    pub sha: Option<String>,
}

/// Parse `nightly.json` (`{ "sha", "version", ... }`).
pub fn parse_nightly_json(v: &Value) -> Option<RemoteExtension> {
    let version = v.get("version")?.as_str()?.trim().to_string();
    if version.is_empty() {
        return None;
    }
    let sha = v.get("sha").and_then(Value::as_str).map(str::trim).filter(|s| !s.is_empty()).map(str::to_string);
    Some(RemoteExtension { version, sha })
}

/// Whether the channel's extension package is newer than the installed one.
///
/// Rule: a higher version is an update. An equal version is an update only on
/// the nightly channel, when the remote commit is known, differs from the
/// installed commit (Chrome's `version_name` carries it; elsewhere it is
/// unknown) and differs from the commit the user was already notified
/// about — so a same-day rebuild is detected once and never nags.
pub fn extension_update_available(
    channel: UpdateChannel,
    remote: &RemoteExtension,
    installed_version: &str,
    installed_sha: Option<&str>,
    notified_sha: Option<&str>,
) -> bool {
    match compare_versions(&remote.version, installed_version) {
        1 => true,
        -1 => false,
        _ => {
            if channel != UpdateChannel::Nightly {
                return false;
            }
            let Some(remote_sha) = remote.sha.as_deref() else { return false };
            if installed_sha.is_some_and(|s| same_commit(s, remote_sha)) {
                return false;
            }
            !notified_sha.is_some_and(|s| same_commit(s, remote_sha))
        }
    }
}

/// One entry of the `files` map in `aipage-web.json`.
#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
pub struct WebFile {
    pub sha256: String,
    pub size: u64,
}

/// The `aipage-web.json` hash manifest written by `xtask build --target web`.
#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
pub struct WebManifest {
    pub version: String,
    #[serde(default)]
    pub sha: String,
    #[serde(default)]
    pub built_at: String,
    /// Published file name → hash/size. `BTreeMap` keeps the order stable.
    pub files: BTreeMap<String, WebFile>,
}

impl WebManifest {
    /// Parse and validate: a version, at least one file, 64-hex sha256s.
    pub fn parse(json: &str) -> Result<Self, String> {
        let m: WebManifest = serde_json::from_str(json).map_err(|e| format!("aipage-web.json: {e}"))?;
        if m.version.trim().is_empty() {
            return Err("aipage-web.json: empty version".into());
        }
        if m.files.is_empty() {
            return Err("aipage-web.json: no files".into());
        }
        for (name, f) in &m.files {
            if name.is_empty() || name.contains('/') || name.contains('\\') || name.starts_with('.') {
                return Err(format!("aipage-web.json: suspicious file name `{name}`"));
            }
            if f.sha256.len() != 64 || !f.sha256.chars().all(|c| c.is_ascii_hexdigit()) {
                return Err(format!("aipage-web.json: `{name}` has no valid sha256"));
            }
        }
        Ok(m)
    }
}

/// Role of a published web file for the self-updating sidebar.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum BundleRole {
    /// The wasm-bindgen glue (`sidebar.<hash>.js`), imported as a blob module.
    Glue,
    /// The wasm module (`sidebar_bg.<hash>.wasm`), instantiated from bytes.
    Wasm,
    /// A stylesheet (`sidebar.<hash>.css`, `tailwind.<hash>.css`).
    Css,
    /// Not needed by the bundled `sidebar.html` + loader (`sidebar.html`,
    /// `sidebar_loader.<hash>.js`, `vercel.json`); never downloaded.
    Skip,
}

/// Classify a published file name by its role in the bundle.
pub fn bundle_role(name: &str) -> BundleRole {
    let lower = name.to_ascii_lowercase();
    if lower.ends_with(".wasm") {
        BundleRole::Wasm
    } else if lower.ends_with(".css") {
        BundleRole::Css
    } else if lower.ends_with(".js") && lower.starts_with("sidebar.") && !lower.starts_with("sidebar_loader") {
        BundleRole::Glue
    } else {
        BundleRole::Skip
    }
}

/// The files the extension downloads from a web manifest, in a stable order,
/// with their roles. Exactly one glue and one wasm are required.
pub fn files_to_install(m: &WebManifest) -> Result<Vec<(String, BundleRole, WebFile)>, String> {
    let out: Vec<(String, BundleRole, WebFile)> = m
        .files
        .iter()
        .map(|(n, f)| (n.clone(), bundle_role(n), f.clone()))
        .filter(|(_, role, _)| *role != BundleRole::Skip)
        .collect();
    let glue = out.iter().filter(|(_, r, _)| *r == BundleRole::Glue).count();
    let wasm = out.iter().filter(|(_, r, _)| *r == BundleRole::Wasm).count();
    if glue != 1 || wasm != 1 {
        return Err(format!("aipage-web.json: expected one glue js and one wasm, found {glue}/{wasm}"));
    }
    Ok(out)
}

/// Metadata of the bundle installed in IndexedDB (the `meta` record).
#[derive(Clone, Debug, PartialEq, Eq, Default)]
pub struct InstalledBundle {
    pub version: String,
    pub sha: String,
    pub channel: String,
}

/// Whether a web manifest should replace the installed bundle.
///
/// Rule: install when nothing is installed, when the installed bundle came
/// from another channel, when the version is higher, or when the version is
/// equal and the commit differs (nightly rebuild). Never when the remote is
/// older. The caller separately refuses bundles older than the extension's
/// own bundled sidebar (see [`ui_source`]).
pub fn bundle_is_newer(remote: &WebManifest, channel: UpdateChannel, installed: Option<&InstalledBundle>) -> bool {
    let Some(inst) = installed else { return true };
    if inst.channel != channel.as_str() {
        return true;
    }
    match compare_versions(&remote.version, &inst.version) {
        1 => true,
        -1 => false,
        _ => !remote.sha.is_empty() && !same_commit(&remote.sha, &inst.sha),
    }
}

/// Where the sidebar UI is loaded from.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum UiSource {
    /// The Vercel-hosted page (content script points the iframe at it).
    Hosted,
    /// The bundle downloaded from GitHub releases into IndexedDB, imported by
    /// `sidebar_loader.js` as blob modules.
    GithubBundle,
    /// The files shipped inside the extension package.
    Bundled,
}

/// Precedence between the three sidebar sources:
/// **Vercel hosted → GitHub-downloaded bundle → bundled.**
///
/// The hosted UI wins whenever it is enabled (its own fallback on failure is
/// the bundled page, which then applies this rule again without the hosted
/// option). The GitHub bundle is used only when its setting is on, a bundle
/// is installed and its version is not older than the extension's own
/// bundled sidebar (`extension_version`): after an extension update a stale
/// download must not shadow the newer built-in UI.
pub fn ui_source(
    remote_ui_enabled: bool,
    github_bundle_enabled: bool,
    installed_bundle_version: Option<&str>,
    extension_version: &str,
) -> UiSource {
    if remote_ui_enabled {
        return UiSource::Hosted;
    }
    match installed_bundle_version {
        Some(v) if github_bundle_enabled && compare_versions(v, extension_version) >= 0 => UiSource::GithubBundle,
        _ => UiSource::Bundled,
    }
}

/// Lower-case hex SHA-256 of `bytes`.
pub fn sha256_hex(bytes: &[u8]) -> String {
    let digest = Sha256::digest(bytes);
    let mut out = String::with_capacity(64);
    for b in digest {
        out.push_str(&format!("{b:02x}"));
    }
    out
}

/// Verify a downloaded file against its manifest entry.
pub fn verify_file(name: &str, bytes: &[u8], expected: &WebFile) -> Result<(), String> {
    if bytes.len() as u64 != expected.size {
        return Err(format!("{name}: size {} != {}", bytes.len(), expected.size));
    }
    let actual = sha256_hex(bytes);
    if !actual.eq_ignore_ascii_case(&expected.sha256) {
        return Err(format!("{name}: sha256 mismatch"));
    }
    Ok(())
}

/// MIME type stored next to each downloaded file (the loader uses it for the
/// blob URLs).
pub fn content_type_for(name: &str) -> &'static str {
    let lower = name.to_ascii_lowercase();
    if lower.ends_with(".js") {
        "text/javascript"
    } else if lower.ends_with(".wasm") {
        "application/wasm"
    } else if lower.ends_with(".css") {
        "text/css"
    } else if lower.ends_with(".html") {
        "text/html"
    } else if lower.ends_with(".json") {
        "application/json"
    } else {
        "application/octet-stream"
    }
}

/// Whether an HTTP status from the GitHub API means "rate limited" (GitHub
/// answers 403, newer deployments 429, both with `x-ratelimit-remaining: 0`).
pub fn is_rate_limited(status: u16, ratelimit_remaining: Option<&str>) -> bool {
    matches!(status, 403 | 429) && ratelimit_remaining.map(str::trim) == Some("0")
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn compares_semver_and_nightly_stamps() {
        assert_eq!(compare_versions("1.8.0", "1.7.0"), 1);
        assert_eq!(compare_versions("1.7.0", "1.7.1"), -1);
        assert_eq!(compare_versions("1.7.0", "1.7.0"), 0);
        assert_eq!(compare_versions("2.0", "1.9.9"), 1);
        assert_eq!(compare_versions("1.7", "1.7.0"), 0);
        // nightly `base.YYYYMMDD` sorts above its base and below the next release
        assert_eq!(compare_versions("1.7.0.20261006", "1.7.0"), 1);
        assert_eq!(compare_versions("1.7.0", "1.7.0.20261006"), -1);
        assert_eq!(compare_versions("1.7.0.20261007", "1.7.0.20261006"), 1);
        assert_eq!(compare_versions("1.7.1", "1.7.0.20261006"), 1);
        assert_eq!(compare_versions("1.7.0.20261006", "1.7.1"), -1);
        assert_eq!(compare_versions(" 1.7.0.20261006 ", "1.7.0.20261006"), 0);
        // garbage components count as 0
        assert_eq!(compare_versions("1.x.0", "1.0.0"), 0);
    }

    #[test]
    fn tags_and_version_names() {
        assert_eq!(version_from_tag("v1.8.0"), "1.8.0");
        assert_eq!(version_from_tag("1.8.0"), "1.8.0");
        assert_eq!(version_from_tag(" V2.0 "), "2.0");
        assert_eq!(sha_from_version_name("1.7.0-nightly.20261006+abc1234"), Some("abc1234"));
        assert_eq!(sha_from_version_name("1.7.0"), None);
        assert_eq!(sha_from_version_name("1.7.0+"), None);
        assert_eq!(sha_from_version_name("1.7.0+not-hex"), None);
        assert!(same_commit("abc1234", "abc1234def5678"));
        assert!(same_commit("ABC1234DEF5678", "abc1234"));
        assert!(!same_commit("abc1234", "abd1234"));
        assert!(!same_commit("", ""));
    }

    #[test]
    fn channels_parse_and_build_urls() {
        assert_eq!(UpdateChannel::from_str_or_default("nightly"), UpdateChannel::Nightly);
        assert_eq!(UpdateChannel::from_str_or_default("stable"), UpdateChannel::Stable);
        assert_eq!(UpdateChannel::from_str_or_default(""), UpdateChannel::Stable);
        assert_eq!(UpdateChannel::from_str_or_default("beta"), UpdateChannel::Stable);
        assert_eq!(UpdateChannel::default().as_str(), "stable");
        assert_eq!(UpdateChannel::Stable.release_api_url(), "https://api.github.com/repos/dasmatus/aipage/releases/latest");
        assert_eq!(UpdateChannel::Nightly.release_api_url(), "https://api.github.com/repos/dasmatus/aipage/releases/tags/nightly");
    }

    #[test]
    fn classifies_browsers() {
        assert_eq!(Browser::from_user_agent("Mozilla/5.0 (X11; Linux) Gecko/20100101 Firefox/131.0"), Browser::Firefox);
        assert_eq!(Browser::from_user_agent("Mozilla/5.0 (Macintosh) AppleWebKit/605 Version/17 Safari/605"), Browser::Safari);
        assert_eq!(Browser::from_user_agent("Mozilla/5.0 AppleWebKit/537 Chrome/141 Safari/537"), Browser::Chrome);
        assert_eq!(Browser::from_user_agent(""), Browser::Chrome);
    }

    fn assets(names: &[&str]) -> Vec<Asset> {
        names
            .iter()
            .map(|n| Asset { name: n.to_string(), browser_download_url: format!("https://github.com/dasmatus/aipage/releases/download/v1/{n}") })
            .collect()
    }

    #[test]
    fn matches_packages_by_canonical_name_then_prefix() {
        let a = assets(&["aipage-web.zip", "aipage-chrome.zip", "aipage-firefox.xpi", "aipage-safari-macos.zip", "aipage-safari.zip", "nightly.json"]);
        assert_eq!(matching_package(&a, Browser::Chrome).unwrap().name, "aipage-chrome.zip");
        assert_eq!(matching_package(&a, Browser::Firefox).unwrap().name, "aipage-firefox.xpi");
        // canonical wins over the longer prefixed name
        assert_eq!(matching_package(&a, Browser::Safari).unwrap().name, "aipage-safari.zip");
        let only_macos = assets(&["AIPage-Safari-macOS.zip", "aipage-chrome.zip"]);
        assert_eq!(matching_package(&only_macos, Browser::Safari).unwrap().name, "AIPage-Safari-macOS.zip");
        assert!(matching_package(&assets(&["aipage-web.zip"]), Browser::Chrome).is_none());
        // `aipage-web.zip` must never be mistaken for a browser package
        assert!(matching_package(&assets(&["aipage-web.zip", "aipage-web.json"]), Browser::Safari).is_none());
    }

    #[test]
    fn reads_release_objects() {
        let release = json!({
            "tag_name": "v1.8.0",
            "published_at": "2026-10-06T03:17:00Z",
            "assets": [
                { "name": "aipage-chrome.zip", "browser_download_url": "https://github.com/x/aipage-chrome.zip" },
                { "name": "broken" },
                { "name": "aipage-web.json", "browser_download_url": "https://github.com/x/aipage-web.json" }
            ]
        });
        assert_eq!(release_version(&release).as_deref(), Some("1.8.0"));
        assert_eq!(release_published_at(&release).as_deref(), Some("2026-10-06T03:17:00Z"));
        let a = release_assets(&release);
        assert_eq!(a.len(), 2, "assets without a download url are dropped");
        assert_eq!(find_asset(&a, WEB_MANIFEST_ASSET).unwrap().browser_download_url, "https://github.com/x/aipage-web.json");
        assert!(find_asset(&a, "nightly.json").is_none());
        assert_eq!(release_version(&json!({ "tag_name": "nightly" })).as_deref(), Some("nightly"));
        assert_eq!(release_version(&json!({})), None);
        assert!(release_assets(&json!({ "assets": "nope" })).is_empty());
    }

    #[test]
    fn parses_nightly_json() {
        let v = json!({ "sha": "0123abcd", "version": "1.7.0.20261006", "assets": [] });
        assert_eq!(parse_nightly_json(&v), Some(RemoteExtension { version: "1.7.0.20261006".into(), sha: Some("0123abcd".into()) }));
        assert_eq!(parse_nightly_json(&json!({ "version": "1.7.0", "sha": "" })), Some(RemoteExtension { version: "1.7.0".into(), sha: None }));
        assert_eq!(parse_nightly_json(&json!({ "sha": "abc" })), None);
    }

    #[test]
    fn extension_update_rule() {
        let stable = UpdateChannel::Stable;
        let nightly = UpdateChannel::Nightly;
        let remote = |v: &str, sha: Option<&str>| RemoteExtension { version: v.into(), sha: sha.map(String::from) };

        // plain version comparison on both channels
        assert!(extension_update_available(stable, &remote("1.8.0", None), "1.7.0", None, None));
        assert!(!extension_update_available(stable, &remote("1.7.0", None), "1.7.0", None, None));
        assert!(!extension_update_available(stable, &remote("1.6.0", None), "1.7.0", None, None));
        assert!(extension_update_available(nightly, &remote("1.7.0.20261006", Some("aaa")), "1.7.0", None, None));
        assert!(extension_update_available(nightly, &remote("1.7.0.20261007", Some("bbb")), "1.7.0.20261006", Some("aaa"), None));
        assert!(!extension_update_available(nightly, &remote("1.7.0.20261006", Some("aaa")), "1.7.1", None, None));
        // same version, stable: never (no sha to tell builds apart)
        assert!(!extension_update_available(stable, &remote("1.7.0", Some("bbb")), "1.7.0", Some("aaa"), None));
        // same version, nightly: a different commit is a rebuild...
        assert!(extension_update_available(nightly, &remote("1.7.0.20261006", Some("bbb")), "1.7.0.20261006", Some("aaa"), None));
        // ...unless it is the installed commit (Chrome knows it via version_name)
        assert!(!extension_update_available(nightly, &remote("1.7.0.20261006", Some("aaa1111")), "1.7.0.20261006", Some("aaa1111222"), None));
        // ...or the user was already told about it (Firefox/Safari: installed sha unknown)
        assert!(!extension_update_available(nightly, &remote("1.7.0.20261006", Some("bbb")), "1.7.0.20261006", None, Some("bbb")));
        assert!(extension_update_available(nightly, &remote("1.7.0.20261006", Some("ccc")), "1.7.0.20261006", None, Some("bbb")));
        // unknown remote sha: nothing to compare
        assert!(!extension_update_available(nightly, &remote("1.7.0.20261006", None), "1.7.0.20261006", None, None));
    }

    const MANIFEST: &str = r#"{
        "version": "1.7.0.20261006",
        "sha": "0123456789abcdef0123456789abcdef01234567",
        "built_at": "2026-10-06T03:20:00Z",
        "files": {
            "sidebar.html": { "sha256": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "size": 903 },
            "sidebar.fe6e8c8c5190.js": { "sha256": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", "size": 48719 },
            "sidebar_bg.3050fca62328.wasm": { "sha256": "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc", "size": 1588342 },
            "sidebar_loader.4e31c3dbd384.js": { "sha256": "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd", "size": 415 },
            "sidebar.578585a4d618.css": { "sha256": "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee", "size": 4638 },
            "tailwind.f2170e90e154.css": { "sha256": "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff", "size": 33350 }
        }
    }"#;

    #[test]
    fn parses_and_validates_web_manifest() {
        let m = WebManifest::parse(MANIFEST).unwrap();
        assert_eq!(m.version, "1.7.0.20261006");
        assert_eq!(m.sha, "0123456789abcdef0123456789abcdef01234567");
        assert_eq!(m.files.len(), 6);
        assert_eq!(m.files["sidebar.html"].size, 903);

        assert!(WebManifest::parse("{}").is_err());
        assert!(WebManifest::parse(r#"{"version":"1","files":{}}"#).is_err());
        assert!(WebManifest::parse(r#"{"version":"","files":{"a.js":{"sha256":"00","size":1}}}"#).is_err());
        assert!(WebManifest::parse(r#"{"version":"1","files":{"a.js":{"sha256":"00","size":1}}}"#).unwrap_err().contains("sha256"));
        assert!(WebManifest::parse(r#"{"version":"1","files":{"../a.js":{"sha256":"0000000000000000000000000000000000000000000000000000000000000000","size":1}}}"#).is_err());
        // optional fields default
        let m = WebManifest::parse(r#"{"version":"1","files":{"sidebar.x.js":{"sha256":"0000000000000000000000000000000000000000000000000000000000000000","size":1}}}"#).unwrap();
        assert_eq!(m.sha, "");
        assert_eq!(m.built_at, "");
    }

    #[test]
    fn classifies_bundle_files() {
        assert_eq!(bundle_role("sidebar.fe6e8c8c5190.js"), BundleRole::Glue);
        assert_eq!(bundle_role("sidebar.js"), BundleRole::Glue);
        assert_eq!(bundle_role("sidebar_bg.3050fca62328.wasm"), BundleRole::Wasm);
        assert_eq!(bundle_role("sidebar.578585a4d618.css"), BundleRole::Css);
        assert_eq!(bundle_role("tailwind.f2170e90e154.css"), BundleRole::Css);
        assert_eq!(bundle_role("sidebar_loader.4e31c3dbd384.js"), BundleRole::Skip);
        assert_eq!(bundle_role("sidebar.html"), BundleRole::Skip);
        assert_eq!(bundle_role("vercel.json"), BundleRole::Skip);

        let m = WebManifest::parse(MANIFEST).unwrap();
        let files = files_to_install(&m).unwrap();
        let names: Vec<&str> = files.iter().map(|(n, _, _)| n.as_str()).collect();
        assert_eq!(names, ["sidebar.578585a4d618.css", "sidebar.fe6e8c8c5190.js", "sidebar_bg.3050fca62328.wasm", "tailwind.f2170e90e154.css"]);
        assert_eq!(files.iter().filter(|(_, r, _)| *r == BundleRole::Css).count(), 2);

        let no_wasm = WebManifest::parse(r#"{"version":"1","files":{"sidebar.x.js":{"sha256":"0000000000000000000000000000000000000000000000000000000000000000","size":1}}}"#).unwrap();
        assert!(files_to_install(&no_wasm).is_err());
    }

    #[test]
    fn bundle_update_rule() {
        let m = WebManifest::parse(MANIFEST).unwrap();
        let nightly = UpdateChannel::Nightly;
        let installed = |v: &str, sha: &str, ch: &str| InstalledBundle { version: v.into(), sha: sha.into(), channel: ch.into() };

        assert!(bundle_is_newer(&m, nightly, None));
        assert!(bundle_is_newer(&m, nightly, Some(&installed("1.7.0", "zzz", "nightly"))));
        assert!(bundle_is_newer(&m, nightly, Some(&installed("1.7.0.20261005", "zzz", "nightly"))));
        assert!(!bundle_is_newer(&m, nightly, Some(&installed("1.7.0.20261007", "zzz", "nightly"))));
        assert!(!bundle_is_newer(&m, nightly, Some(&installed("1.7.1", "zzz", "nightly"))));
        // same version: rebuild (different commit) vs. identical build
        assert!(bundle_is_newer(&m, nightly, Some(&installed("1.7.0.20261006", "fedcba", "nightly"))));
        assert!(!bundle_is_newer(&m, nightly, Some(&installed("1.7.0.20261006", "0123456", "nightly"))));
        // a channel switch always reinstalls
        assert!(bundle_is_newer(&m, nightly, Some(&installed("1.9.0", "0123456", "stable"))));
        // a manifest without a sha never counts as a rebuild
        let mut no_sha = m.clone();
        no_sha.sha.clear();
        assert!(!bundle_is_newer(&no_sha, nightly, Some(&installed("1.7.0.20261006", "whatever", "nightly"))));
    }

    #[test]
    fn ui_source_precedence() {
        // Vercel hosted wins whenever enabled
        assert_eq!(ui_source(true, true, Some("9.9.9"), "1.7.0"), UiSource::Hosted);
        assert_eq!(ui_source(true, false, None, "1.7.0"), UiSource::Hosted);
        // then the GitHub bundle, if on, installed and not older than the extension
        assert_eq!(ui_source(false, true, Some("1.7.0.20261006"), "1.7.0"), UiSource::GithubBundle);
        assert_eq!(ui_source(false, true, Some("1.7.0"), "1.7.0"), UiSource::GithubBundle);
        assert_eq!(ui_source(false, true, Some("1.7.0.20261006"), "1.8.0"), UiSource::Bundled);
        assert_eq!(ui_source(false, true, None, "1.7.0"), UiSource::Bundled);
        assert_eq!(ui_source(false, false, Some("1.7.0.20261006"), "1.7.0"), UiSource::Bundled);
        // the bundled files are the last resort
        assert_eq!(ui_source(false, false, None, "1.7.0"), UiSource::Bundled);
    }

    #[test]
    fn sha256_hex_matches_known_vectors() {
        assert_eq!(sha256_hex(b""), "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
        assert_eq!(sha256_hex(b"abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
        let f = WebFile { sha256: "BA7816BF8F01CFEA414140DE5DAE2223B00361A396177A9CB410FF61F20015AD".into(), size: 3 };
        assert!(verify_file("a", b"abc", &f).is_ok(), "hex comparison is case-insensitive");
        assert!(verify_file("a", b"abd", &f).unwrap_err().contains("sha256"));
        assert!(verify_file("a", b"abcd", &f).unwrap_err().contains("size"));
    }

    #[test]
    fn content_types_and_rate_limit() {
        assert_eq!(content_type_for("sidebar.abc.js"), "text/javascript");
        assert_eq!(content_type_for("sidebar_bg.abc.wasm"), "application/wasm");
        assert_eq!(content_type_for("tailwind.abc.css"), "text/css");
        assert_eq!(content_type_for("sidebar.html"), "text/html");
        assert_eq!(content_type_for("x.bin"), "application/octet-stream");
        assert!(is_rate_limited(403, Some("0")));
        assert!(is_rate_limited(429, Some(" 0 ")));
        assert!(!is_rate_limited(403, Some("12")));
        assert!(!is_rate_limited(403, None));
        assert!(!is_rate_limited(200, Some("0")));
    }
}
