//! Shared logic for the AIPage extension: data model, storage, i18n, AI
//! providers, the managed-agent loop, markdown rendering and image generation.
//!
//! Modules that touch browser APIs are compiled for `wasm32` only; the pure
//! data/logic modules also build natively so they can be unit-tested with
//! `cargo test`.

pub mod agent;
pub mod chat;
pub mod i18n;
pub mod imagegen;
pub mod markdown;
pub mod providers;
pub mod proxy;
pub mod storage;
pub mod types;

pub fn version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}
