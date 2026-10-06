//! Self-updating sidebar bundle: download the hosted-sidebar files of a
//! GitHub release into IndexedDB.
//!
//! The release carries `aipage-web.json` (written by `xtask build --target
//! web`), listing every file of `dist-web/` with its sha256 and size, and the
//! files themselves as individual assets. No zip is unpacked in wasm: the
//! background downloads the glue js, the wasm and the stylesheets one by one
//! (`browser_download_url`, which redirects to `objects.githubusercontent.com`),
//! verifies each against the manifest and stores them in the extension
//! origin's IndexedDB, where `assets/sidebar_loader.js` picks them up.
//!
//! # IndexedDB schema
//!
//! Database [`updates::UI_BUNDLE_DB`] (version 1), one object store
//! [`updates::UI_BUNDLE_STORE`] keyed by `name`:
//!
//! - one record per file: `{ name, contentType, sha256, size, bytes: ArrayBuffer }`;
//! - the [`updates::UI_BUNDLE_META_KEY`] record:
//!   `{ name: "meta", version, sha, channel, builtAt, installedAt, glue, wasm, css: [..], files: { name: { sha256, size } } }`.
//!
//! The store is replaced atomically (clear + puts in one readwrite
//! transaction); the loader treats any inconsistency as "no bundle".
//!
//! # Trust
//!
//! Files come from GitHub over TLS and are checked against `aipage-web.json`,
//! which comes from the same release, so this trusts the repository's release
//! pipeline exactly as installing the extension package does.

use js_sys::Uint8Array;
use serde_json::{json, Value};
use wasm_bindgen::JsValue;

use aipage_bindings::{from_js, idb, js_object, to_js};
use aipage_core::updates::{self, BundleRole, InstalledBundle, UpdateChannel, WebManifest, UI_BUNDLE_DB, UI_BUNDLE_META_KEY, UI_BUNDLE_STORE};

const DB_VERSION: u32 = 1;

/// The `meta` record, as read back from IndexedDB.
#[derive(Clone, Debug, Default)]
pub(crate) struct InstalledMeta {
    pub version: String,
    pub sha: String,
    pub channel: String,
    pub built_at: String,
    pub installed_at: String,
}

impl InstalledMeta {
    fn from_json(v: &Value) -> Option<Self> {
        let s = |k: &str| v.get(k).and_then(Value::as_str).unwrap_or("").to_string();
        let version = s("version");
        (!version.is_empty()).then(|| Self {
            version,
            sha: s("sha"),
            channel: s("channel"),
            built_at: s("builtAt"),
            installed_at: s("installedAt"),
        })
    }

    pub fn to_json(&self) -> Value {
        json!({
            "version": self.version,
            "sha": self.sha,
            "channel": self.channel,
            "builtAt": self.built_at,
            "installedAt": self.installed_at,
        })
    }

    fn as_installed(&self) -> InstalledBundle {
        InstalledBundle { version: self.version.clone(), sha: self.sha.clone(), channel: self.channel.clone() }
    }
}

async fn open_db() -> Result<web_sys::IdbDatabase, String> {
    idb::open(UI_BUNDLE_DB, DB_VERSION, UI_BUNDLE_STORE).await
}

/// Metadata of the installed bundle, `None` when there is none (or the
/// database is unreadable).
pub(crate) async fn installed_meta() -> Option<InstalledMeta> {
    let db = open_db().await.ok()?;
    let v = idb::get(&db, UI_BUNDLE_STORE, UI_BUNDLE_META_KEY).await.ok()?;
    db.close();
    InstalledMeta::from_json(&from_js(&v))
}

/// Remove the downloaded bundle ("Use bundled UI").
pub(crate) async fn clear() -> Result<(), String> {
    let db = open_db().await?;
    let r = idb::clear(&db, UI_BUNDLE_STORE).await;
    db.close();
    r
}

/// Bring IndexedDB in line with the channel's release. Returns the
/// `uiBundle` part of the update report (`result` is one of `installed`,
/// `up_to_date`, `not_available`, `older_than_extension`).
pub(crate) async fn sync(channel: UpdateChannel, release: &Value, extension_version: &str) -> Result<Value, String> {
    let assets = updates::release_assets(release);
    let Some(manifest_asset) = updates::find_asset(&assets, updates::WEB_MANIFEST_ASSET) else {
        return Ok(json!({ "result": "not_available" }));
    };
    let manifest_text = crate::fetch_text(&manifest_asset.browser_download_url).await?;
    let manifest = WebManifest::parse(&manifest_text)?;

    if updates::compare_versions(&manifest.version, extension_version) < 0 {
        return Ok(json!({ "result": "older_than_extension", "version": manifest.version }));
    }

    let installed = installed_meta().await;
    if !updates::bundle_is_newer(&manifest, channel, installed.as_ref().map(InstalledMeta::as_installed).as_ref()) {
        return Ok(json!({ "result": "up_to_date", "version": manifest.version }));
    }

    let files = updates::files_to_install(&manifest)?;
    let mut records: Vec<JsValue> = Vec::with_capacity(files.len() + 1);
    let (mut glue, mut wasm, mut css) = (String::new(), String::new(), Vec::new());
    for (name, role, expected) in &files {
        let asset = updates::find_asset(&assets, name)
            .ok_or_else(|| format!("release has no asset `{name}` listed in aipage-web.json"))?;
        let bytes = crate::fetch_bytes(&asset.browser_download_url).await?;
        updates::verify_file(name, &bytes, expected)?;
        match role {
            BundleRole::Glue => glue = name.clone(),
            BundleRole::Wasm => wasm = name.clone(),
            BundleRole::Css => css.push(name.clone()),
            BundleRole::Skip => {}
        }
        records.push(js_object(&[
            ("name", JsValue::from_str(name)),
            ("contentType", JsValue::from_str(updates::content_type_for(name))),
            ("sha256", JsValue::from_str(&expected.sha256)),
            ("size", JsValue::from_f64(expected.size as f64)),
            ("bytes", Uint8Array::from(bytes.as_slice()).buffer().into()),
        ]));
    }

    let installed_at = js_sys::Date::new_0().to_iso_string().as_string().unwrap_or_default();
    let files_json: Value = files
        .iter()
        .map(|(n, _, f)| (n.clone(), json!({ "sha256": f.sha256, "size": f.size })))
        .collect::<serde_json::Map<String, Value>>()
        .into();
    let meta = json!({
        "name": UI_BUNDLE_META_KEY,
        "version": manifest.version,
        "sha": manifest.sha,
        "channel": channel.as_str(),
        "builtAt": manifest.built_at,
        "installedAt": installed_at,
        "glue": glue,
        "wasm": wasm,
        "css": css,
        "files": files_json,
    });
    records.push(to_js(&meta));

    let db = open_db().await?;
    let written = idb::replace_all(&db, UI_BUNDLE_STORE, &records).await;
    db.close();
    written?;

    aipage_bindings::console::log(format!(
        "[AIPage] UI bundle {} ({}) installed from the {} channel",
        manifest.version,
        &manifest.sha[..manifest.sha.len().min(7)],
        channel.as_str()
    ));
    Ok(json!({ "result": "installed", "version": manifest.version }))
}
