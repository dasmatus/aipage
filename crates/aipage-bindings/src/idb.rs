//! Minimal async IndexedDB helpers (extension origin).
//!
//! Used by the background to store the sidebar bundle downloaded from GitHub
//! releases, and read back by `assets/sidebar_loader.js` (plain JS, same
//! origin). One database, one object store keyed by a `name` property; every
//! `IDBRequest` is wrapped into a future that resolves with `request.result`
//! or rejects with the request's `DOMException` message.

use js_sys::{Function, Promise, Reflect};
use wasm_bindgen::prelude::*;
use wasm_bindgen::JsCast;
use wasm_bindgen_futures::JsFuture;
use web_sys::{IdbDatabase, IdbFactory, IdbObjectStore, IdbObjectStoreParameters, IdbOpenDbRequest, IdbRequest, IdbTransactionMode};

/// Error text of a failed request (its `DOMException` message), or a generic one.
fn request_error(req: &IdbRequest) -> String {
    req.error()
        .ok()
        .flatten()
        .map(|e| format!("{}: {}", e.name(), e.message()))
        .unwrap_or_else(|| "IndexedDB request failed".to_string())
}

/// Await an `IDBRequest`, resolving with its `result`.
async fn await_request(req: IdbRequest) -> Result<JsValue, String> {
    let promise = Promise::new(&mut |resolve, reject| {
        let req_ok = req.clone();
        let on_success = Closure::once_into_js(move |_e: JsValue| {
            let _ = resolve.call1(&JsValue::NULL, &req_ok.result().unwrap_or(JsValue::UNDEFINED));
        });
        let req_err = req.clone();
        let on_error = Closure::once_into_js(move |_e: JsValue| {
            let _ = reject.call1(&JsValue::NULL, &JsValue::from_str(&request_error(&req_err)));
        });
        req.set_onsuccess(Some(on_success.unchecked_ref::<Function>()));
        req.set_onerror(Some(on_error.unchecked_ref::<Function>()));
    });
    JsFuture::from(promise).await.map_err(|e| e.as_string().unwrap_or_else(|| "IndexedDB request failed".into()))
}

/// `indexedDB` of the current global (window or worker), if available.
fn factory() -> Result<IdbFactory, String> {
    Reflect::get(&js_sys::global(), &JsValue::from_str("indexedDB"))
        .ok()
        .and_then(|v| v.dyn_into::<IdbFactory>().ok())
        .ok_or_else(|| "IndexedDB is not available in this context".to_string())
}

/// Open (creating on first use) database `db` at version `version` with one
/// object store `store` keyed by the `name` property of each record.
pub async fn open(db: &str, version: u32, store: &str) -> Result<IdbDatabase, String> {
    let req: IdbOpenDbRequest = factory()?.open_with_u32(db, version).map_err(|e| js_err(&e))?;
    let store_name = store.to_string();
    let on_upgrade = Closure::wrap(Box::new(move |e: web_sys::Event| {
        let Some(target) = e.target() else { return };
        let Ok(req) = target.dyn_into::<IdbRequest>() else { return };
        let Ok(db) = req.result().and_then(|v| v.dyn_into::<IdbDatabase>()) else { return };
        if !db.object_store_names().contains(&store_name) {
            let params = IdbObjectStoreParameters::new();
            params.set_key_path(&JsValue::from_str("name"));
            let _ = db.create_object_store_with_optional_parameters(&store_name, &params);
        }
    }) as Box<dyn Fn(web_sys::Event)>);
    req.set_onupgradeneeded(Some(on_upgrade.as_ref().unchecked_ref()));
    let result = await_request(req.clone().into()).await;
    drop(on_upgrade);
    result?.dyn_into::<IdbDatabase>().map_err(|_| "IndexedDB open returned no database".to_string())
}

fn object_store(db: &IdbDatabase, store: &str, mode: IdbTransactionMode) -> Result<IdbObjectStore, String> {
    db.transaction_with_str_and_mode(store, mode)
        .map_err(|e| js_err(&e))?
        .object_store(store)
        .map_err(|e| js_err(&e))
}

/// Read one record by key (`undefined` when absent).
pub async fn get(db: &IdbDatabase, store: &str, key: &str) -> Result<JsValue, String> {
    let req = object_store(db, store, IdbTransactionMode::Readonly)?
        .get(&JsValue::from_str(key))
        .map_err(|e| js_err(&e))?;
    await_request(req).await
}

/// All keys of the store, as strings.
pub async fn keys(db: &IdbDatabase, store: &str) -> Result<Vec<String>, String> {
    let req = object_store(db, store, IdbTransactionMode::Readonly)?.get_all_keys().map_err(|e| js_err(&e))?;
    let arr = js_sys::Array::from(&await_request(req).await?);
    Ok(arr.iter().filter_map(|k| k.as_string()).collect())
}

/// Replace the store's contents with `records` in one readwrite transaction
/// (clear, then put each). Every record must carry a string `name` key.
pub async fn replace_all(db: &IdbDatabase, store: &str, records: &[JsValue]) -> Result<(), String> {
    let os = object_store(db, store, IdbTransactionMode::Readwrite)?;
    await_request(os.clear().map_err(|e| js_err(&e))?).await?;
    for r in records {
        await_request(os.put(r).map_err(|e| js_err(&e))?).await?;
    }
    Ok(())
}

/// Delete every record of the store.
pub async fn clear(db: &IdbDatabase, store: &str) -> Result<(), String> {
    let os = object_store(db, store, IdbTransactionMode::Readwrite)?;
    await_request(os.clear().map_err(|e| js_err(&e))?).await.map(|_| ())
}

fn js_err(e: &JsValue) -> String {
    e.as_string()
        .or_else(|| e.dyn_ref::<js_sys::Error>().map(|err| String::from(err.message())))
        .or_else(|| e.dyn_ref::<web_sys::DomException>().map(|ex| format!("{}: {}", ex.name(), ex.message())))
        .unwrap_or_else(|| "IndexedDB error".to_string())
}
