//! "Sign in with ChatGPT": a standard OAuth 2.1 authorization-code client
//! with PKCE against OpenAI's documented authorization server.
//!
//! What OpenAI documents for third-party apps (the pages the user guide
//! links; re-checked against the live discovery document):
//!
//! * `https://developers.openai.com/api/docs/guides/sign-in-with-chatgpt` —
//!   the integration guide: the client id (`oaiapp_*`) and the exact callback
//!   URL come from OpenAI's registration; OpenID Connect discovery at
//!   [`DISCOVERY_URL`]; issuer [`ISSUER`]; authorization-code flow with PKCE
//!   `S256`, `state` and `nonce`; public clients use token-endpoint auth
//!   `none` and send `client_id` in the token request.
//! * `https://developers.openai.com/siwc/token-sharing-open-source/sign-in`
//!   and `.../token-reference` — the scopes for using the signed-in user's
//!   ChatGPT plan (`offline_access resource.invoke chatgpt.tokens.use.direct`
//!   on top of `openid profile email`), the `resource` parameter
//!   [`RESOURCE`], the rotating refresh token, one-hour access tokens
//!   (`expires_in: 3600`) whose `aud` is `https://api.openai.com/v1`.
//! * `https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference`
//!   — the token is accepted by `POST https://api.openai.com/v1/responses`
//!   (with `store: false`, `stream: true`) and `GET /v1/models`; see
//!   [`crate::providers::responses`].
//! * `https://developers.openai.com/siwc/token-sharing-open-source/errors-and-recovery`
//!   — the refresh error codes that mean "sign in again"
//!   ([`is_unusable_refresh_error`]).
//! * `https://auth.openai.com/.well-known/openid-configuration` — the live
//!   metadata (authorization, token, revocation and userinfo endpoints,
//!   `code_challenge_methods_supported: ["S256"]`,
//!   `token_endpoint_auth_methods_supported` including `none`).
//!
//! No credential is embedded: [`OPENAI_OAUTH_CLIENT_ID`] is empty until the
//! repository owner registers the extension with OpenAI (see its docs), and
//! the stored override [`KEY_OPENAI_OAUTH_CLIENT_ID`] lets a build be used
//! without recompiling. Everything in the first half of this file is pure and
//! unit-tested natively; the `flow` functions at the bottom drive the browser
//! (storage, the background proxy, `chrome.identity`).

use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};

/// OAuth client id issued by OpenAI for this extension.
///
/// Empty by default: set it to the `oaiapp_…` id from the owner's own
/// registration with OpenAI (`https://developers.openai.com/siwc/request-client-id`).
/// The redirect URI to register is the extension's
/// `chrome.identity.getRedirectURL()` value, which is
/// `https://<extension-id>.chromiumapp.org/` on Chrome and
/// `https://<uuid>.extensions.allizom.org/` on Firefox; the settings view
/// shows it read-only under "Redirect URL to register" once the ChatGPT /
/// OpenAI engine is selected. Safari has no identity API and uses
/// [`fallback_redirect_uri`] instead. Users can override an empty (or
/// outdated) build-time id from the settings "advanced" field, which stores
/// it under [`KEY_OPENAI_OAUTH_CLIENT_ID`].
pub const OPENAI_OAUTH_CLIENT_ID: &str = "";

/// OpenID issuer; the discovery document must repeat it.
pub const ISSUER: &str = "https://auth.openai.com";
/// OpenID Connect discovery document.
pub const DISCOVERY_URL: &str = "https://auth.openai.com/.well-known/openid-configuration";
/// Documented endpoints, used when discovery is unavailable.
pub const AUTHORIZATION_ENDPOINT: &str = "https://auth.openai.com/api/accounts/authorize";
pub const TOKEN_ENDPOINT: &str = "https://auth.openai.com/api/accounts/oauth/token";
pub const REVOCATION_ENDPOINT: &str = "https://auth.openai.com/api/accounts/oauth/revoke";

/// The `resource` the access token is minted for (its `aud`): the public
/// OpenAI API.
pub const RESOURCE: &str = "https://api.openai.com/v1";
/// Identity scopes from the discovery document plus the documented
/// ChatGPT-plan-usage scopes.
pub const DEFAULT_SCOPES: &str = "openid profile email offline_access resource.invoke chatgpt.tokens.use.direct";
/// The scope that marks "requests may use the user's ChatGPT plan".
pub const SCOPE_PLAN_USAGE: &str = "chatgpt.tokens.use.direct";

/// `storage.local` key holding the [`TokenSet`] (an object).
pub const KEY_OPENAI_OAUTH: &str = "openai_oauth";
/// `storage.local` key of the client-id override (a string).
pub const KEY_OPENAI_OAUTH_CLIENT_ID: &str = "openai_oauth_client_id";

/// Refresh when the access token expires within this window.
pub const REFRESH_LEEWAY_MS: f64 = 60_000.0;

/// Path appended to the hosted-UI origin for the no-identity-API fallback
/// redirect (Safari): the page need not exist, the user copies the final URL
/// out of the address bar.
pub const FALLBACK_REDIRECT_PATH: &str = "oauth/callback";

// --- encoding helpers ---

const B64URL: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

/// base64url without padding (RFC 4648 §5), as PKCE and JWTs use it.
pub fn base64url_encode(bytes: &[u8]) -> String {
    let mut out = String::with_capacity(bytes.len().div_ceil(3) * 4);
    for chunk in bytes.chunks(3) {
        let b = [chunk[0], *chunk.get(1).unwrap_or(&0), *chunk.get(2).unwrap_or(&0)];
        let n = (u32::from(b[0]) << 16) | (u32::from(b[1]) << 8) | u32::from(b[2]);
        out.push(B64URL[(n >> 18) as usize & 63] as char);
        out.push(B64URL[(n >> 12) as usize & 63] as char);
        if chunk.len() > 1 {
            out.push(B64URL[(n >> 6) as usize & 63] as char);
        }
        if chunk.len() > 2 {
            out.push(B64URL[n as usize & 63] as char);
        }
    }
    out
}

/// base64url decode, tolerating padding and the standard alphabet.
pub fn base64url_decode(s: &str) -> Option<Vec<u8>> {
    let s = s.trim_end_matches('=');
    let mut out = Vec::with_capacity(s.len() * 3 / 4);
    let mut acc: u32 = 0;
    let mut bits = 0;
    for c in s.bytes() {
        let v = match c {
            b'A'..=b'Z' => c - b'A',
            b'a'..=b'z' => c - b'a' + 26,
            b'0'..=b'9' => c - b'0' + 52,
            b'-' | b'+' => 62,
            b'_' | b'/' => 63,
            _ => return None,
        };
        acc = (acc << 6) | u32::from(v);
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            out.push((acc >> bits) as u8);
            acc &= (1 << bits) - 1;
        }
    }
    Some(out)
}

/// Percent-encode everything but the RFC 3986 unreserved characters (space
/// becomes `%20`, which both query strings and form bodies accept).
pub fn percent_encode(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => out.push(b as char),
            _ => out.push_str(&format!("%{b:02X}")),
        }
    }
    out
}

fn percent_decode(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        match bytes[i] {
            b'%' if i + 2 < bytes.len() => {
                let hex = std::str::from_utf8(&bytes[i + 1..i + 3]).ok().and_then(|h| u8::from_str_radix(h, 16).ok());
                match hex {
                    Some(v) => {
                        out.push(v);
                        i += 3;
                        continue;
                    }
                    None => out.push(b'%'),
                }
            }
            b'+' => out.push(b' '),
            b => out.push(b),
        }
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

/// `application/x-www-form-urlencoded` body / query string from pairs.
pub fn form_encode(pairs: &[(&str, &str)]) -> String {
    pairs
        .iter()
        .map(|(k, v)| format!("{}={}", percent_encode(k), percent_encode(v)))
        .collect::<Vec<_>>()
        .join("&")
}

/// Decode a query string (or fragment) into pairs, in order.
pub fn parse_query(query: &str) -> Vec<(String, String)> {
    query
        .split('&')
        .filter(|p| !p.is_empty())
        .map(|p| match p.split_once('=') {
            Some((k, v)) => (percent_decode(k), percent_decode(v)),
            None => (percent_decode(p), String::new()),
        })
        .collect()
}

// --- PKCE (RFC 7636) ---

/// `code_verifier` from 32 random bytes: 43 base64url characters.
pub fn code_verifier_from_bytes(random: &[u8; 32]) -> String {
    base64url_encode(random)
}

/// `S256` challenge: `BASE64URL(SHA256(ASCII(code_verifier)))`.
pub fn code_challenge(verifier: &str) -> String {
    base64url_encode(&Sha256::digest(verifier.as_bytes()))
}

/// A random `state` / `nonce` value from 16 bytes.
pub fn random_token_from_bytes(random: &[u8]) -> String {
    base64url_encode(random)
}

// --- discovery ---

/// The endpoints this client needs, from discovery or the constants.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Endpoints {
    pub authorization: String,
    pub token: String,
    pub revocation: Option<String>,
}

impl Endpoints {
    /// The documented endpoints.
    pub fn defaults() -> Self {
        Self {
            authorization: AUTHORIZATION_ENDPOINT.to_string(),
            token: TOKEN_ENDPOINT.to_string(),
            revocation: Some(REVOCATION_ENDPOINT.to_string()),
        }
    }

    /// Endpoints from an OpenID discovery document. Rejected when the issuer
    /// is not [`ISSUER`], an endpoint is missing or not `https://`, or the
    /// server does not advertise `S256` (when it lists methods at all).
    pub fn from_metadata(meta: &Value) -> Result<Self, String> {
        if meta.get("issuer").and_then(Value::as_str) != Some(ISSUER) {
            return Err("discovery document has an unexpected issuer".into());
        }
        let https = |key: &str| -> Result<String, String> {
            let v = meta.get(key).and_then(Value::as_str).ok_or_else(|| format!("discovery document lacks {key}"))?;
            if !v.starts_with("https://") {
                return Err(format!("{key} is not https"));
            }
            Ok(v.to_string())
        };
        if let Some(methods) = meta.get("code_challenge_methods_supported").and_then(Value::as_array) {
            if !methods.iter().any(|m| m.as_str() == Some("S256")) {
                return Err("authorization server does not support PKCE S256".into());
            }
        }
        Ok(Self {
            authorization: https("authorization_endpoint")?,
            token: https("token_endpoint")?,
            revocation: https("revocation_endpoint").ok(),
        })
    }
}

// --- client id ---

/// The stored override when non-empty, else the build-time constant
/// (trimmed; empty means "not configured").
pub fn effective_client_id(stored_override: &str) -> String {
    let o = stored_override.trim();
    if o.is_empty() { OPENAI_OAUTH_CLIENT_ID.trim().to_string() } else { o.to_string() }
}

/// Redirect URI used when the browser has no `identity` API (Safari):
/// `<hosted-ui-origin>/oauth/callback`.
pub fn fallback_redirect_uri(remote_ui_base: &str) -> String {
    format!("{}/{}", remote_ui_base.trim_end_matches('/'), FALLBACK_REDIRECT_PATH)
}

// --- authorization request ---

/// Everything needed to build the authorization URL and later verify the
/// redirect and exchange the code.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct AuthorizationRequest {
    pub client_id: String,
    pub redirect_uri: String,
    pub scope: String,
    pub state: String,
    pub nonce: String,
    pub code_verifier: String,
}

impl AuthorizationRequest {
    /// The URL to open in the browser.
    pub fn url(&self, endpoints: &Endpoints) -> String {
        let challenge = code_challenge(&self.code_verifier);
        let query = form_encode(&[
            ("response_type", "code"),
            ("client_id", &self.client_id),
            ("redirect_uri", &self.redirect_uri),
            ("scope", &self.scope),
            ("state", &self.state),
            ("nonce", &self.nonce),
            ("code_challenge", &challenge),
            ("code_challenge_method", "S256"),
            ("resource", RESOURCE),
        ]);
        let sep = if endpoints.authorization.contains('?') { '&' } else { '?' };
        format!("{}{sep}{query}", endpoints.authorization)
    }

    /// Form body of the authorization-code exchange (public client: no
    /// secret, `client_id` in the body).
    pub fn token_request_body(&self, code: &str) -> String {
        form_encode(&[
            ("grant_type", "authorization_code"),
            ("client_id", &self.client_id),
            ("code", code),
            ("redirect_uri", &self.redirect_uri),
            ("code_verifier", &self.code_verifier),
            ("resource", RESOURCE),
        ])
    }
}

/// Form body of a refresh-token grant.
pub fn refresh_request_body(client_id: &str, refresh_token: &str) -> String {
    form_encode(&[
        ("grant_type", "refresh_token"),
        ("client_id", client_id),
        ("refresh_token", refresh_token),
        ("resource", RESOURCE),
    ])
}

/// Form body of a revocation request (RFC 7009).
pub fn revoke_request_body(client_id: &str, token: &str, token_type_hint: &str) -> String {
    form_encode(&[("client_id", client_id), ("token", token), ("token_type_hint", token_type_hint)])
}

// --- redirect parsing ---

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum RedirectError {
    /// Not the registered redirect URI (or no query at all).
    NotRedirect,
    /// The server answered with `error` (+ optional `error_description`).
    Server { error: String, description: Option<String> },
    StateMismatch,
    MissingCode,
}

impl std::fmt::Display for RedirectError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            RedirectError::NotRedirect => write!(f, "that is not the redirect URL of this sign-in"),
            RedirectError::Server { error, description } => match description {
                Some(d) => write!(f, "{d} ({error})"),
                None => write!(f, "{error}"),
            },
            RedirectError::StateMismatch => write!(f, "state mismatch (the sign-in did not start here)"),
            RedirectError::MissingCode => write!(f, "the redirect carries no authorization code"),
        }
    }
}

/// Extract the authorization code from the final redirect URL, checking that
/// it targets `redirect_uri` and carries the expected `state`. Parameters
/// are read from the query (OpenAI's only response mode) and, failing that,
/// from the fragment.
pub fn parse_redirect(url: &str, redirect_uri: &str, expected_state: &str) -> Result<String, RedirectError> {
    let url = url.trim();
    if !url.starts_with(redirect_uri.trim_end_matches('/')) {
        return Err(RedirectError::NotRedirect);
    }
    let (without_fragment, fragment) = match url.split_once('#') {
        Some((u, f)) => (u, Some(f)),
        None => (url, None),
    };
    let mut params = without_fragment.split_once('?').map(|(_, q)| parse_query(q)).unwrap_or_default();
    if !params.iter().any(|(k, _)| k == "code" || k == "error") {
        if let Some(f) = fragment {
            params = parse_query(f);
        }
    }
    if params.is_empty() {
        return Err(RedirectError::NotRedirect);
    }
    let get = |key: &str| params.iter().find(|(k, _)| k == key).map(|(_, v)| v.clone());
    if let Some(error) = get("error") {
        return Err(RedirectError::Server { error, description: get("error_description") });
    }
    if get("state").as_deref() != Some(expected_state) {
        return Err(RedirectError::StateMismatch);
    }
    get("code").filter(|c| !c.is_empty()).ok_or(RedirectError::MissingCode)
}

// --- tokens ---

/// The persisted sign-in state (`storage.local[openai_oauth]`).
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct TokenSet {
    pub access_token: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub refresh_token: Option<String>,
    /// Unix time in milliseconds.
    pub expires_at: f64,
    #[serde(default)]
    pub scope: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub id_token: Option<String>,
    /// From the id_token payload, for display only.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub email: Option<String>,
}

impl TokenSet {
    /// Build from a token-endpoint response received at `now_ms`. On a
    /// refresh the previous set supplies whatever the server did not resend
    /// (refresh token, scope, id_token).
    pub fn from_response(resp: &Value, now_ms: f64, previous: Option<&TokenSet>) -> Result<TokenSet, String> {
        let access_token = resp
            .get("access_token")
            .and_then(Value::as_str)
            .filter(|s| !s.is_empty())
            .ok_or("token response has no access_token")?
            .to_string();
        if let Some(t) = resp.get("token_type").and_then(Value::as_str) {
            if !t.eq_ignore_ascii_case("bearer") {
                return Err(format!("unsupported token_type {t}"));
            }
        }
        let expires_in = resp.get("expires_in").and_then(Value::as_f64).unwrap_or(3600.0);
        let refresh_token = resp
            .get("refresh_token")
            .and_then(Value::as_str)
            .map(str::to_string)
            .or_else(|| previous.and_then(|p| p.refresh_token.clone()));
        let scope = resp
            .get("scope")
            .and_then(Value::as_str)
            .map(str::to_string)
            .or_else(|| previous.map(|p| p.scope.clone()))
            .unwrap_or_default();
        let id_token = resp
            .get("id_token")
            .and_then(Value::as_str)
            .map(str::to_string)
            .or_else(|| previous.and_then(|p| p.id_token.clone()));
        let email = id_token
            .as_deref()
            .and_then(email_from_id_token)
            .or_else(|| previous.and_then(|p| p.email.clone()));
        Ok(TokenSet { access_token, refresh_token, expires_at: now_ms + expires_in * 1000.0, scope, id_token, email })
    }

    /// `true` when the access token has expired or does so within
    /// [`REFRESH_LEEWAY_MS`].
    pub fn is_expiring(&self, now_ms: f64) -> bool {
        now_ms + REFRESH_LEEWAY_MS >= self.expires_at
    }

    pub fn has_scope(&self, scope: &str) -> bool {
        self.scope.split_whitespace().any(|s| s == scope)
    }

    /// Whether the grant includes ChatGPT plan usage.
    pub fn has_plan_usage(&self) -> bool {
        self.has_scope(SCOPE_PLAN_USAGE)
    }
}

/// The payload of a JWT, decoded **without** signature verification: only
/// ever used to display the email, never trusted for anything else.
pub fn decode_jwt_payload(jwt: &str) -> Option<Value> {
    let mut parts = jwt.split('.');
    let (_header, payload, _sig) = (parts.next()?, parts.next()?, parts.next()?);
    if parts.next().is_some() {
        return None;
    }
    let bytes = base64url_decode(payload)?;
    serde_json::from_slice(&bytes).ok().filter(Value::is_object)
}

/// The `email` claim of an id_token, if any.
pub fn email_from_id_token(id_token: &str) -> Option<String> {
    decode_jwt_payload(id_token)?.get("email")?.as_str().map(str::to_string)
}

/// Check the `nonce` claim against the one sent in the authorization
/// request. An id_token without a nonce passes (nothing to compare).
pub fn nonce_matches(id_token: &str, expected: &str) -> bool {
    match decode_jwt_payload(id_token).and_then(|p| p.get("nonce").and_then(Value::as_str).map(str::to_string)) {
        Some(n) => n == expected,
        None => true,
    }
}

/// Human-readable message from a token-endpoint error. The proxy hands back
/// the body as a string; an OAuth `{ error, error_description }` object
/// becomes `description (error)`.
pub fn token_error_message(raw: &str) -> String {
    let v: Value = match serde_json::from_str(raw) {
        Ok(v) => v,
        Err(_) => return raw.to_string(),
    };
    oauth_error_parts(&v)
        .map(|(e, d)| match d {
            Some(d) => format!("{d} ({e})"),
            None => e,
        })
        .unwrap_or_else(|| raw.to_string())
}

/// `(error, error_description)` from an OAuth error object.
fn oauth_error_parts(v: &Value) -> Option<(String, Option<String>)> {
    let e = v.get("error")?.as_str()?.to_string();
    Some((e, v.get("error_description").and_then(Value::as_str).map(str::to_string)))
}

/// The OAuth `error` code in a failed token response, if any.
pub fn token_error_code(raw: &str) -> Option<String> {
    serde_json::from_str::<Value>(raw).ok().and_then(|v| oauth_error_parts(&v)).map(|(e, _)| e)
}

/// Refresh errors after which the stored tokens are useless and the user
/// has to sign in again (from OpenAI's errors-and-recovery page).
pub fn is_unusable_refresh_error(code: &str) -> bool {
    matches!(
        code,
        "invalid_grant"
            | "invalid_refresh_token"
            | "token_expired"
            | "refresh_token_expired"
            | "refresh_token_invalidated"
            | "refresh_token_reused"
    )
}

// --- credential precedence ---

/// How a request to the ChatGPT / OpenAI provider authenticates.
#[derive(Clone, Debug, PartialEq)]
pub enum Credential {
    /// A pasted API key: the public API, `/v1/chat/completions`.
    ApiKey(String),
    /// A Sign-in-with-ChatGPT access token: the Responses API.
    OAuth(TokenSet),
    None,
}

/// Manual API key if set, else the OAuth token set, else nothing.
pub fn resolve_credential(api_key: Option<&str>, oauth: Option<TokenSet>) -> Credential {
    match api_key.map(str::trim).filter(|k| !k.is_empty()) {
        Some(k) => Credential::ApiKey(k.to_string()),
        None => oauth.map(Credential::OAuth).unwrap_or(Credential::None),
    }
}

// --- browser flow ---

/// Cryptographically random bytes from `crypto.getRandomValues`.
#[cfg(target_arch = "wasm32")]
fn random_bytes(n: usize) -> Result<Vec<u8>, String> {
    use js_sys::{Function, Reflect, Uint8Array};
    use wasm_bindgen::{JsCast, JsValue};
    let global = js_sys::global();
    let crypto = Reflect::get(&global, &JsValue::from_str("crypto")).map_err(|_| "no crypto")?;
    let f = Reflect::get(&crypto, &JsValue::from_str("getRandomValues"))
        .ok()
        .and_then(|f| f.dyn_into::<Function>().ok())
        .ok_or("crypto.getRandomValues is unavailable")?;
    let arr = Uint8Array::new_with_length(n as u32);
    f.call1(&crypto, &arr).map_err(|_| "getRandomValues failed")?;
    Ok(arr.to_vec())
}

#[cfg(not(target_arch = "wasm32"))]
fn random_bytes(_n: usize) -> Result<Vec<u8>, String> {
    Err("random bytes are only available in the browser".into())
}

/// The sign-in flow as the sidebar drives it: build the request, open the
/// browser (or hand the URL to the user), exchange the code, keep the tokens
/// fresh. Storage and HTTP go through [`crate::storage`] / [`crate::proxy`].
pub mod flow {
    use super::*;
    use crate::proxy::{self, perform_request};
    use crate::storage;
    use std::collections::HashMap;

    fn now_ms() -> f64 {
        #[cfg(target_arch = "wasm32")]
        {
            js_sys::Date::now()
        }
        #[cfg(not(target_arch = "wasm32"))]
        {
            0.0
        }
    }

    fn form_headers() -> HashMap<String, String> {
        let mut h = HashMap::new();
        h.insert("Content-Type".to_string(), "application/x-www-form-urlencoded".to_string());
        h.insert("Accept".to_string(), "application/json".to_string());
        h
    }

    /// The configured client id (stored override, else the constant).
    pub async fn client_id() -> String {
        effective_client_id(&storage::get_openai_oauth_client_id().await)
    }

    /// Endpoints from the discovery document, or the documented defaults
    /// when it cannot be fetched or fails validation.
    pub async fn discover() -> Endpoints {
        match perform_request(DISCOVERY_URL, "GET", &HashMap::new(), None).await {
            Ok(meta) => match Endpoints::from_metadata(&meta) {
                Ok(e) => e,
                Err(e) => {
                    aipage_bindings::console::warn(format!("[AIPage oauth] discovery rejected: {e}; using defaults"));
                    Endpoints::defaults()
                }
            },
            Err(e) => {
                aipage_bindings::console::warn(format!("[AIPage oauth] discovery failed: {e}; using defaults"));
                Endpoints::defaults()
            }
        }
    }

    /// A pending sign-in: the request and the URL to open.
    #[derive(Clone, Debug)]
    pub struct Pending {
        pub request: AuthorizationRequest,
        pub endpoints: Endpoints,
        pub url: String,
    }

    /// Start a sign-in for `redirect_uri`. Fails when no client id is
    /// configured or no randomness is available.
    pub async fn begin(redirect_uri: &str) -> Result<Pending, String> {
        let client_id = client_id().await;
        if client_id.is_empty() {
            return Err("no OAuth client id is configured".into());
        }
        let mut verifier_bytes = [0u8; 32];
        verifier_bytes.copy_from_slice(&random_bytes(32)?);
        let request = AuthorizationRequest {
            client_id,
            redirect_uri: redirect_uri.to_string(),
            scope: DEFAULT_SCOPES.to_string(),
            state: random_token_from_bytes(&random_bytes(16)?),
            nonce: random_token_from_bytes(&random_bytes(16)?),
            code_verifier: code_verifier_from_bytes(&verifier_bytes),
        };
        let endpoints = discover().await;
        let url = request.url(&endpoints);
        Ok(Pending { request, endpoints, url })
    }

    /// Finish a sign-in from the final redirect URL: verify state, exchange
    /// the code, check the nonce, persist the tokens.
    pub async fn complete(pending: &Pending, redirect_url: &str) -> Result<TokenSet, String> {
        let code = parse_redirect(redirect_url, &pending.request.redirect_uri, &pending.request.state)
            .map_err(|e| e.to_string())?;
        let body = pending.request.token_request_body(&code);
        let resp = perform_request(&pending.endpoints.token, "POST", &form_headers(), Some(&body))
            .await
            .map_err(|e| token_error_message(&e))?;
        let tokens = TokenSet::from_response(&resp, now_ms(), None)?;
        if let Some(id) = tokens.id_token.as_deref() {
            if !nonce_matches(id, &pending.request.nonce) {
                return Err("id_token nonce mismatch".into());
            }
        }
        storage::save_openai_oauth(&tokens).await;
        Ok(tokens)
    }

    /// Refresh `tokens`. Persists the new set; clears the stored set when the
    /// server says the refresh token is unusable.
    pub async fn refresh(tokens: &TokenSet) -> Result<TokenSet, String> {
        let refresh_token = tokens.refresh_token.as_deref().ok_or("no refresh token; sign in again")?;
        let client_id = client_id().await;
        let endpoints = discover().await;
        let body = refresh_request_body(&client_id, refresh_token);
        match perform_request(&endpoints.token, "POST", &form_headers(), Some(&body)).await {
            Ok(resp) => {
                let next = TokenSet::from_response(&resp, now_ms(), Some(tokens))?;
                storage::save_openai_oauth(&next).await;
                Ok(next)
            }
            Err(e) => {
                if token_error_code(&e).as_deref().is_some_and(is_unusable_refresh_error) {
                    storage::clear_openai_oauth().await;
                }
                Err(token_error_message(&e))
            }
        }
    }

    /// The stored token set, refreshed first when it is about to expire.
    /// `None` when not signed in (or the refresh failed).
    pub async fn current_tokens() -> Option<TokenSet> {
        let tokens = storage::get_openai_oauth().await?;
        if !tokens.is_expiring(now_ms()) {
            return Some(tokens);
        }
        match refresh(&tokens).await {
            Ok(t) => Some(t),
            Err(e) => {
                aipage_bindings::console::warn(format!("[AIPage oauth] refresh failed: {e}"));
                None
            }
        }
    }

    /// Refresh regardless of expiry (after a 401). `None` when not signed in
    /// or the refresh failed.
    pub async fn force_refresh() -> Option<TokenSet> {
        let tokens = storage::get_openai_oauth().await?;
        refresh(&tokens).await.ok()
    }

    /// Whether the last proxied request failed with HTTP 401.
    pub fn last_request_unauthorized() -> bool {
        proxy::last_error_status() == Some(401)
    }

    /// Revoke the refresh token (best effort, when a revocation endpoint is
    /// known) and forget the sign-in.
    pub async fn sign_out() {
        if let Some(tokens) = storage::get_openai_oauth().await {
            let endpoints = discover().await;
            if let Some(url) = endpoints.revocation {
                let client_id = client_id().await;
                let (token, hint) = match tokens.refresh_token.as_deref() {
                    Some(r) => (r, "refresh_token"),
                    None => (tokens.access_token.as_str(), "access_token"),
                };
                let body = revoke_request_body(&client_id, token, hint);
                if let Err(e) = perform_request(&url, "POST", &form_headers(), Some(&body)).await {
                    aipage_bindings::console::warn(format!("[AIPage oauth] revocation failed: {e}"));
                }
            }
        }
        storage::clear_openai_oauth().await;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn pkce_rfc7636_appendix_b_vector() {
        let verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
        assert_eq!(code_challenge(verifier), "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
        // The RFC's verifier is the base64url of these 32 octets.
        let octets: [u8; 32] = [
            116, 24, 223, 180, 151, 153, 224, 37, 79, 250, 96, 125, 216, 173, 187, 186, 22, 212, 37, 77, 105, 214,
            191, 240, 91, 88, 5, 88, 83, 132, 141, 121,
        ];
        assert_eq!(code_verifier_from_bytes(&octets), verifier);
        assert_eq!(verifier.len(), 43);
    }

    #[test]
    fn base64url_round_trips_without_padding() {
        for input in [&b""[..], b"f", b"fo", b"foo", b"foob", b"fooba", b"foobar", &[0xff, 0xfe, 0xfd, 0x00]] {
            let enc = base64url_encode(input);
            assert!(!enc.contains('='), "{enc}");
            assert!(!enc.contains('+') && !enc.contains('/'), "{enc}");
            assert_eq!(base64url_decode(&enc).unwrap(), input);
        }
        assert_eq!(base64url_encode(b"foobar"), "Zm9vYmFy");
        assert_eq!(base64url_decode("Zm9vYg==").unwrap(), b"foob");
        assert!(base64url_decode("not base64!").is_none());
    }

    #[test]
    fn percent_and_form_encoding() {
        assert_eq!(percent_encode("a-b_c.d~e"), "a-b_c.d~e");
        assert_eq!(percent_encode("https://x.chromiumapp.org/"), "https%3A%2F%2Fx.chromiumapp.org%2F");
        assert_eq!(percent_encode("openid profile"), "openid%20profile");
        assert_eq!(percent_encode("ü"), "%C3%BC");
        assert_eq!(form_encode(&[("a", "1 2"), ("b", "&=")]), "a=1%202&b=%26%3D");
        assert_eq!(parse_query("a=1+2&b=%26%3D&c&d="), vec![
            ("a".to_string(), "1 2".to_string()),
            ("b".to_string(), "&=".to_string()),
            ("c".to_string(), String::new()),
            ("d".to_string(), String::new()),
        ]);
    }

    fn request() -> AuthorizationRequest {
        AuthorizationRequest {
            client_id: "oaiapp_test".into(),
            redirect_uri: "https://abc.chromiumapp.org/".into(),
            scope: DEFAULT_SCOPES.into(),
            state: "st4te".into(),
            nonce: "n0nce".into(),
            code_verifier: "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk".into(),
        }
    }

    #[test]
    fn authorization_url_carries_every_parameter() {
        let url = request().url(&Endpoints::defaults());
        let (base, query) = url.split_once('?').unwrap();
        assert_eq!(base, AUTHORIZATION_ENDPOINT);
        let q = parse_query(query);
        let get = |k: &str| q.iter().find(|(key, _)| key == k).map(|(_, v)| v.as_str());
        assert_eq!(get("response_type"), Some("code"));
        assert_eq!(get("client_id"), Some("oaiapp_test"));
        assert_eq!(get("redirect_uri"), Some("https://abc.chromiumapp.org/"));
        assert_eq!(get("scope"), Some(DEFAULT_SCOPES));
        assert_eq!(get("state"), Some("st4te"));
        assert_eq!(get("nonce"), Some("n0nce"));
        assert_eq!(get("code_challenge"), Some("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"));
        assert_eq!(get("code_challenge_method"), Some("S256"));
        assert_eq!(get("resource"), Some(RESOURCE));
        assert!(url.contains("scope=openid%20profile%20email%20offline_access%20resource.invoke%20chatgpt.tokens.use.direct"));
        // An authorization endpoint that already has a query gets `&`.
        let ep = Endpoints { authorization: "https://auth.example/a?x=1".into(), ..Endpoints::defaults() };
        assert!(request().url(&ep).starts_with("https://auth.example/a?x=1&response_type=code"));
    }

    #[test]
    fn token_refresh_and_revoke_bodies_are_form_encoded() {
        let body = request().token_request_body("c0de");
        assert_eq!(
            body,
            "grant_type=authorization_code&client_id=oaiapp_test&code=c0de&redirect_uri=https%3A%2F%2Fabc.chromiumapp.org%2F&code_verifier=dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk&resource=https%3A%2F%2Fapi.openai.com%2Fv1"
        );
        assert!(!body.contains("client_secret"));
        assert_eq!(
            refresh_request_body("oaiapp_test", "rt"),
            "grant_type=refresh_token&client_id=oaiapp_test&refresh_token=rt&resource=https%3A%2F%2Fapi.openai.com%2Fv1"
        );
        assert_eq!(revoke_request_body("c", "t", "refresh_token"), "client_id=c&token=t&token_type_hint=refresh_token");
    }

    #[test]
    fn redirect_parsing() {
        let r = "https://abc.chromiumapp.org/";
        assert_eq!(parse_redirect("https://abc.chromiumapp.org/?code=abc&state=st4te", r, "st4te"), Ok("abc".into()));
        assert_eq!(parse_redirect("  https://abc.chromiumapp.org?state=st4te&code=x%2Fy  ", r, "st4te"), Ok("x/y".into()));
        assert_eq!(
            parse_redirect("https://abc.chromiumapp.org/?code=abc&state=other", r, "st4te"),
            Err(RedirectError::StateMismatch)
        );
        assert_eq!(parse_redirect("https://abc.chromiumapp.org/?code=abc", r, "st4te"), Err(RedirectError::StateMismatch));
        assert_eq!(parse_redirect("https://abc.chromiumapp.org/?state=st4te", r, "st4te"), Err(RedirectError::MissingCode));
        assert_eq!(
            parse_redirect("https://abc.chromiumapp.org/?error=access_denied&error_description=User%20cancelled", r, "st4te"),
            Err(RedirectError::Server { error: "access_denied".into(), description: Some("User cancelled".into()) })
        );
        assert_eq!(parse_redirect("https://evil.example/?code=abc&state=st4te", r, "st4te"), Err(RedirectError::NotRedirect));
        assert_eq!(parse_redirect("https://abc.chromiumapp.org/", r, "st4te"), Err(RedirectError::NotRedirect));
        // Fragment fallback.
        assert_eq!(parse_redirect("https://abc.chromiumapp.org/#code=f&state=st4te", r, "st4te"), Ok("f".into()));
        assert_eq!(RedirectError::StateMismatch.to_string(), "state mismatch (the sign-in did not start here)");
    }

    #[test]
    fn discovery_metadata_is_validated() {
        let meta = json!({
            "issuer": ISSUER,
            "authorization_endpoint": AUTHORIZATION_ENDPOINT,
            "token_endpoint": TOKEN_ENDPOINT,
            "revocation_endpoint": REVOCATION_ENDPOINT,
            "code_challenge_methods_supported": ["S256"],
            "token_endpoint_auth_methods_supported": ["client_secret_basic", "client_secret_post", "none"]
        });
        assert_eq!(Endpoints::from_metadata(&meta).unwrap(), Endpoints::defaults());

        let mut no_revoke = meta.clone();
        no_revoke.as_object_mut().unwrap().remove("revocation_endpoint");
        assert_eq!(Endpoints::from_metadata(&no_revoke).unwrap().revocation, None);

        let mut wrong_issuer = meta.clone();
        wrong_issuer["issuer"] = json!("https://evil.example");
        assert!(Endpoints::from_metadata(&wrong_issuer).is_err());

        let mut http = meta.clone();
        http["token_endpoint"] = json!("http://auth.openai.com/token");
        assert!(Endpoints::from_metadata(&http).is_err());

        let mut plain_only = meta.clone();
        plain_only["code_challenge_methods_supported"] = json!(["plain"]);
        assert!(Endpoints::from_metadata(&plain_only).is_err());

        assert!(Endpoints::from_metadata(&json!({ "issuer": ISSUER })).is_err());
    }

    #[test]
    fn client_id_precedence_and_fallback_redirect() {
        assert_eq!(effective_client_id(""), OPENAI_OAUTH_CLIENT_ID);
        assert_eq!(effective_client_id("  oaiapp_x  "), "oaiapp_x");
        assert_eq!(fallback_redirect_uri("https://aipage-sooty.vercel.app"), "https://aipage-sooty.vercel.app/oauth/callback");
        assert_eq!(fallback_redirect_uri("https://x.example/"), "https://x.example/oauth/callback");
    }

    /// `{"alg":"none"}` header + the given payload, unsigned.
    fn jwt(payload: &Value) -> String {
        format!(
            "{}.{}.sig",
            base64url_encode(br#"{"alg":"RS256","kid":"k"}"#),
            base64url_encode(payload.to_string().as_bytes())
        )
    }

    #[test]
    fn id_token_payload_is_decoded_without_verification() {
        let id = jwt(&json!({ "sub": "u1", "email": "me@example.com", "nonce": "n0nce" }));
        assert_eq!(email_from_id_token(&id), Some("me@example.com".into()));
        assert!(nonce_matches(&id, "n0nce"));
        assert!(!nonce_matches(&id, "other"));
        assert!(nonce_matches(&jwt(&json!({ "sub": "u1" })), "anything"));
        assert_eq!(decode_jwt_payload("garbage"), None);
        assert_eq!(decode_jwt_payload("a.b"), None);
        assert_eq!(decode_jwt_payload("a.b.c.d"), None);
        assert_eq!(email_from_id_token(&jwt(&json!({ "sub": "u1" }))), None);
    }

    #[test]
    fn token_response_parsing_and_expiry() {
        let id = jwt(&json!({ "email": "me@example.com" }));
        let resp = json!({
            "access_token": "at", "refresh_token": "rt", "id_token": id, "token_type": "Bearer",
            "expires_in": 3600, "scope": "openid profile email offline_access resource.invoke chatgpt.tokens.use.direct"
        });
        let t = TokenSet::from_response(&resp, 1_000_000.0, None).unwrap();
        assert_eq!(t.access_token, "at");
        assert_eq!(t.refresh_token.as_deref(), Some("rt"));
        assert_eq!(t.expires_at, 1_000_000.0 + 3_600_000.0);
        assert_eq!(t.email.as_deref(), Some("me@example.com"));
        assert!(t.has_plan_usage());
        assert!(!t.is_expiring(1_000_000.0));
        assert!(!t.is_expiring(1_000_000.0 + 3_600_000.0 - 60_001.0));
        assert!(t.is_expiring(1_000_000.0 + 3_600_000.0 - 60_000.0));
        assert!(t.is_expiring(9_000_000.0));

        // A refresh that omits refresh_token / scope / id_token keeps the old ones.
        let refreshed = TokenSet::from_response(&json!({ "access_token": "at2", "expires_in": 60 }), 2.0, Some(&t)).unwrap();
        assert_eq!(refreshed.access_token, "at2");
        assert_eq!(refreshed.refresh_token.as_deref(), Some("rt"));
        assert_eq!(refreshed.scope, t.scope);
        assert_eq!(refreshed.email.as_deref(), Some("me@example.com"));
        assert_eq!(refreshed.expires_at, 60_002.0);
        // A rotated refresh token replaces the old one.
        let rotated = TokenSet::from_response(&json!({ "access_token": "at3", "refresh_token": "rt2" }), 0.0, Some(&t)).unwrap();
        assert_eq!(rotated.refresh_token.as_deref(), Some("rt2"));
        assert_eq!(rotated.expires_at, 3_600_000.0, "expires_in defaults to one hour");

        assert!(TokenSet::from_response(&json!({ "token_type": "Bearer" }), 0.0, None).is_err());
        assert!(TokenSet::from_response(&json!({ "access_token": "x", "token_type": "MAC" }), 0.0, None).is_err());

        // Persisted shape.
        let stored = serde_json::to_value(&t).unwrap();
        assert_eq!(stored["access_token"], "at");
        assert_eq!(stored["expires_at"], 4_600_000.0);
        assert_eq!(serde_json::from_value::<TokenSet>(stored).unwrap(), t);
        let minimal: TokenSet = serde_json::from_value(json!({ "access_token": "a", "expires_at": 1 })).unwrap();
        assert_eq!(minimal.scope, "");
        assert!(!minimal.has_plan_usage());
    }

    #[test]
    fn token_errors_are_humanized() {
        let raw = r#"{"error":"invalid_grant","error_description":"The refresh token has expired"}"#;
        assert_eq!(token_error_message(raw), "The refresh token has expired (invalid_grant)");
        assert_eq!(token_error_message(r#"{"error":"invalid_client"}"#), "invalid_client");
        assert_eq!(token_error_message("HTTP 500"), "HTTP 500");
        assert_eq!(token_error_code(raw).as_deref(), Some("invalid_grant"));
        assert_eq!(token_error_code("nope"), None);
        for c in ["invalid_grant", "invalid_refresh_token", "token_expired", "refresh_token_expired", "refresh_token_invalidated", "refresh_token_reused"] {
            assert!(is_unusable_refresh_error(c), "{c}");
        }
        assert!(!is_unusable_refresh_error("invalid_client"));
        assert!(!is_unusable_refresh_error("server_error"));
    }

    #[test]
    fn credential_precedence() {
        let tokens = TokenSet { access_token: "at".into(), refresh_token: None, expires_at: 0.0, scope: String::new(), id_token: None, email: None };
        assert_eq!(resolve_credential(Some("sk-x"), Some(tokens.clone())), Credential::ApiKey("sk-x".into()));
        assert_eq!(resolve_credential(Some("  sk-x "), None), Credential::ApiKey("sk-x".into()));
        assert_eq!(resolve_credential(Some(""), Some(tokens.clone())), Credential::OAuth(tokens.clone()));
        assert_eq!(resolve_credential(None, Some(tokens.clone())), Credential::OAuth(tokens));
        assert_eq!(resolve_credential(Some("  "), None), Credential::None);
        assert_eq!(resolve_credential(None, None), Credential::None);
    }

    #[test]
    fn constants_match_the_documented_server() {
        assert!(OPENAI_OAUTH_CLIENT_ID.is_empty(), "no credential may be embedded");
        assert!(AUTHORIZATION_ENDPOINT.starts_with(ISSUER));
        assert!(TOKEN_ENDPOINT.starts_with(ISSUER));
        assert!(REVOCATION_ENDPOINT.starts_with(ISSUER));
        assert!(DISCOVERY_URL.starts_with(ISSUER));
        assert_eq!(RESOURCE, "https://api.openai.com/v1");
        for s in ["openid", "profile", "email", "offline_access", "resource.invoke", SCOPE_PLAN_USAGE] {
            assert!(DEFAULT_SCOPES.split(' ').any(|x| x == s), "{s}");
        }
        assert_eq!(KEY_OPENAI_OAUTH, "openai_oauth");
        assert_eq!(KEY_OPENAI_OAUTH_CLIENT_ID, "openai_oauth_client_id");
    }
}
