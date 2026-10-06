//! Reactive state + async actions for the sidebar.

use std::cell::Cell;

use leptos::prelude::*;
use serde_json::{json, Value};

use aipage_bindings::tabs;
use aipage_core::providers::SendOptions;
use aipage_core::types::{ContextAction, Message, ProviderType, Role};
use aipage_core::{agent, chat, i18n, imagegen, providers, storage};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum View {
    Chat,
    Settings,
    Widgets,
}

thread_local! {
    static NEXT_ID: Cell<u64> = const { Cell::new(0) };
}

fn next_id() -> String {
    NEXT_ID.with(|c| {
        let n = c.get() + 1;
        c.set(n);
        format!("m{n}")
    })
}

fn now() -> f64 {
    js_sys::Date::now()
}

// --- chat state ---

#[derive(Clone, Copy)]
pub struct ChatState {
    pub messages: RwSignal<Vec<Message>>,
    pub is_typing: RwSignal<bool>,
    pub last_page_context: RwSignal<String>,
}

impl ChatState {
    pub fn new() -> Self {
        let greeting = Message::new("init", Role::Ai, chat::INITIAL_GREETING, now());
        Self {
            messages: RwSignal::new(vec![greeting]),
            is_typing: RwSignal::new(false),
            last_page_context: RwSignal::new(String::new()),
        }
    }

    pub fn add(&self, role: Role, content: impl Into<String>, actions: Option<Vec<ContextAction>>, image: Option<String>) {
        let mut msg = Message::new(next_id(), role, content, now());
        msg.actions = actions;
        msg.image_url = image;
        self.messages.update(|m| m.push(msg));
    }

    pub fn update_last(&self, content: impl Into<String>) {
        let content = content.into();
        self.messages.update(|m| {
            if let Some(last) = m.last_mut() {
                last.content = content;
            }
        });
    }

    pub fn update_last_image(&self, image: String, content: String) {
        self.messages.update(|m| {
            if let Some(last) = m.last_mut() {
                last.image_url = Some(image);
                last.content = content;
            }
        });
    }
}

// --- app state ---

#[derive(Clone, Copy)]
pub struct AppState {
    pub view: RwSignal<View>,
    pub provider: RwSignal<ProviderType>,
    pub language: RwSignal<String>,
    pub user_initials: RwSignal<String>,
    pub image_gen_enabled: RwSignal<bool>,
    pub image_gen_provider: RwSignal<String>,
    pub image_gen_sd_url: RwSignal<String>,
    pub image_gen_model: RwSignal<String>,
    pub image_gen_size: RwSignal<String>,
    pub auto_answer_enabled: RwSignal<bool>,
    pub is_scanning: RwSignal<bool>,
    pub is_auto_answering: RwSignal<bool>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            view: RwSignal::new(View::Chat),
            provider: RwSignal::new(ProviderType::OllamaCloud),
            language: RwSignal::new("sk".to_string()),
            user_initials: RwSignal::new("U".to_string()),
            image_gen_enabled: RwSignal::new(false),
            image_gen_provider: RwSignal::new("ollama-svg".to_string()),
            image_gen_sd_url: RwSignal::new("http://localhost:7860".to_string()),
            image_gen_model: RwSignal::new("gpt-oss:120b-cloud".to_string()),
            image_gen_size: RwSignal::new("1024x1024".to_string()),
            auto_answer_enabled: RwSignal::new(false),
            is_scanning: RwSignal::new(false),
            is_auto_answering: RwSignal::new(false),
        }
    }

    /// Active translation table (tracks the `language` signal).
    pub fn tr(&self) -> i18n::Translation {
        i18n::translation(&self.language.get())
    }
}

fn alert(message: &str) {
    if let Some(w) = web_sys::window() {
        let _ = w.alert_with_message(message);
    }
}

fn local_opts(url: String, model: String) -> SendOptions {
    SendOptions {
        base_url: (!url.is_empty()).then_some(url),
        model_name: (!model.is_empty()).then_some(model),
    }
}

// --- actions ---

/// Agentic (tool-calling) path for tool-capable cloud providers, direct
/// one-shot path for local providers.
pub async fn handle_send(app: AppState, chat: ChatState, text: String) {
    let provider = app.provider.get_untracked();
    let key = storage::get_api_key(provider).await.unwrap_or_default();
    let local = storage::get_local_settings(provider).await;
    let opts = local_opts(local.url, local.model);

    if provider.supports_native_tools() {
        send_agent_message(chat, provider, key, text, opts).await;
    } else {
        send_message(chat, provider, key, text, opts).await;
    }
}

/// Direct request/response send.
pub async fn send_message(chat: ChatState, provider: ProviderType, key: String, text: String, opts: SendOptions) {
    if text.trim().is_empty() {
        return;
    }
    if key.is_empty() && provider.requires_api_key() {
        return;
    }
    chat.add(Role::User, text.clone(), None, None);
    chat.is_typing.set(true);
    chat.add(Role::Ai, chat::THINKING_PLACEHOLDER, None, None);

    match providers::send_message(provider, &text, &key, &opts).await {
        Ok(resp) => chat.update_last(resp),
        Err(e) => chat.update_last(format!("Chyba: {e}")),
    }
    chat.is_typing.set(false);
}

/// Agentic send with fallback to a direct reply.
pub async fn send_agent_message(chat: ChatState, provider: ProviderType, key: String, text: String, opts: SendOptions) {
    if text.trim().is_empty() || key.is_empty() {
        return;
    }
    chat.add(Role::User, text.clone(), None, None);
    chat.is_typing.set(true);
    chat.add(Role::Ai, chat::THINKING_PLACEHOLDER, None, None);

    let on_text = move |t: String| chat.update_last(t);
    match agent::run_agent_turn(provider, &key, &text, &opts, on_text).await {
        Ok(()) => {}
        Err(_) => {
            // Fall back to a direct (no-tools) reply from the same provider.
            match providers::send_message(provider, &text, &key, &opts).await {
                Ok(resp) => chat.update_last(resp),
                Err(e) => chat.update_last(format!("Chyba: {e}")),
            }
        }
    }
    chat.is_typing.set(false);
}

/// Read page content from the active tab. No active tab → no alert; a
/// messaging failure (null response) → "scan error"; a tab that answered with
/// empty/missing content → "content load failed".
pub async fn scan_page(app: AppState, chat: ChatState) {
    app.is_scanning.set(true);
    if let Some(resp) = tabs::send_json_to_active(&json!({ "action": "get_page_content" })).await {
        if resp.is_null() {
            alert(&app.tr().alert_scan_error);
        } else {
            let content = resp
                .get("content")
                .and_then(Value::as_str)
                .map(str::to_string)
                .filter(|c| !c.is_empty());
            let is_selection = resp.get("isSelection").and_then(Value::as_bool).unwrap_or(false);
            match content {
                Some(c) => handle_page_context(chat, c, is_selection),
                None => alert(&app.tr().alert_content_load_failed),
            }
        }
    }
    app.is_scanning.set(false);
}

/// Store the scanned context and surface the action buttons.
pub fn handle_page_context(chat: ChatState, content: String, is_selection: bool) {
    chat.last_page_context.set(content.clone());
    let cp = chat::build_page_context(&content, is_selection);
    chat.add(Role::Ai, cp.message, Some(cp.actions), None);
}

pub async fn handle_action_click(app: AppState, chat: ChatState, action: String) {
    if action == "search_web" {
        let query = derive_search_query(chat);
        if !query.is_empty() {
            search_web(app, chat, query).await;
        }
        return;
    }
    let prompt = chat::generate_prompt_from_action(&action, &chat.last_page_context.get_untracked());
    handle_send(app, chat, prompt).await;
}

fn derive_search_query(chat: ChatState) -> String {
    let msgs = chat.messages.get_untracked();
    if let Some(last) = msgs.last() {
        let has_search = last.actions.as_ref().map(|a| a.iter().any(|x| x.action == "search_web")).unwrap_or(false);
        if has_search {
            // Extract the first "quoted" substring from the message content.
            if let Some(start) = last.content.find('"') {
                if let Some(end) = last.content[start + 1..].find('"') {
                    return last.content[start + 1..start + 1 + end].to_string();
                }
            }
        }
    }
    chat.last_page_context.get_untracked()
}

pub async fn search_web(app: AppState, chat: ChatState, query: String) {
    chat.add(Role::User, format!("Search web: {query}"), None, None);
    chat.is_typing.set(true);
    chat.add(Role::Ai, "Searching the web...", None, None);

    let provider = app.provider.get_untracked();
    let key = storage::get_api_key(provider).await.unwrap_or_default();
    let local = storage::get_local_settings(provider).await;
    let opts = local_opts(local.url.clone(), local.model.clone());

    if provider.supports_native_tools() {
        match providers::web_search(provider, query.trim(), &key, &opts).await {
            Ok(answer) => chat.update_last(if answer.is_empty() { "No results found.".to_string() } else { answer }),
            Err(e) => chat.update_last(format!("Search error: {e}")),
        }
        chat.is_typing.set(false);
        return;
    }

    // Local providers: DuckDuckGo then summarize.
    let results = agent::duckduckgo_results(query.trim()).await;
    if results.is_empty() {
        chat.update_last("No search results found.");
        chat.is_typing.set(false);
        return;
    }

    let formatted = results
        .iter()
        .enumerate()
        .map(|(i, r)| {
            format!(
                "{}. **{}**\n   {}\n   Source: {}",
                i + 1,
                r.get("title").and_then(Value::as_str).unwrap_or(""),
                r.get("snippet").and_then(Value::as_str).unwrap_or(""),
                r.get("url").and_then(Value::as_str).unwrap_or("")
            )
        })
        .collect::<Vec<_>>()
        .join("\n\n");

    chat.update_last(format!("Found {} results via DuckDuckGo. Analyzing...", results.len()));

    let lang = app.language.get_untracked();
    let language_name = i18n::LANGUAGES.iter().find(|(c, _)| *c == lang).map(|(_, n)| *n).unwrap_or("Slovak");
    let search_prompt = format!(
        "Based on these web search results for \"{query}\":\n\n{formatted}\n\nPlease provide a comprehensive answer in {language_name} based on these search results."
    );
    // Reuse the direct send path (it appends its own user/placeholder bubbles).
    send_message(chat, provider, key, search_prompt, opts).await;
}

pub async fn generate_image(app: AppState, chat: ChatState, prompt: String) {
    chat.add(Role::User, format!("🎨 {prompt}"), None, None);
    chat.is_typing.set(true);
    chat.add(Role::Ai, app.tr().image_gen_generating.clone(), None, None);

    let provider = app.provider.get_untracked();
    let key = storage::get_api_key(provider).await.unwrap_or_default();
    let local = storage::get_local_settings(provider).await;
    let img_provider = app.image_gen_provider.get_untracked();
    let base_url = if img_provider == "sdwebui" {
        Some(app.image_gen_sd_url.get_untracked())
    } else {
        (!local.url.is_empty()).then_some(local.url)
    };
    // The stored SVG model defaults to an Ollama Cloud id; on other backends
    // draw with the provider's own chat model instead.
    let model = imagegen::resolve_svg_model(provider, &app.image_gen_model.get_untracked(), &local.model);

    let options = imagegen::ImageGenOptions {
        provider: img_provider,
        chat_provider: provider,
        api_key: key,
        base_url,
        model,
        size: app.image_gen_size.get_untracked(),
    };

    match imagegen::generate_image(&prompt, &options).await {
        Ok(data_url) => chat.update_last_image(data_url, prompt),
        Err(e) => chat.update_last(format!("{}: {e}", app.tr().image_gen_failed)),
    }
    chat.is_typing.set(false);
}

/// Detect the exam question and auto-fill the answer.
pub async fn auto_answer(app: AppState, chat: ChatState) {
    app.is_auto_answering.set(true);
    let run = async {
        let Some(tab_id) = tabs::active_tab_id().await else { return };
        let q = tabs::send_json(tab_id, &json!({ "action": "get_exam_question" })).await;
        if !q.get("ok").and_then(Value::as_bool).unwrap_or(false) {
            chat.add(Role::Ai, "⚠️ No exam question found on this page.", None, None);
            return;
        }

        let question_text = q.get("questionText").and_then(Value::as_str).unwrap_or("");
        let input_type = q.get("inputType").and_then(Value::as_str).unwrap_or("unknown");
        let choices = q.get("choices").and_then(Value::as_array);
        let has_choices = choices.map(|c| !c.is_empty()).unwrap_or(false);
        let mut prompt = String::from("Answer this exam question concisely.\n\n");
        // A choice question without options still gets the plain prompt.
        if input_type == "choice" && has_choices {
            prompt.push_str(&format!("Question:\n{question_text}\n\nOptions:\n"));
            let opts = choices
                .unwrap()
                .iter()
                .enumerate()
                .map(|(i, c)| {
                    format!(
                        "{}. {} (value: {})",
                        i + 1,
                        c.get("label").and_then(Value::as_str).unwrap_or(""),
                        c.get("value").and_then(Value::as_str).unwrap_or("")
                    )
                })
                .collect::<Vec<_>>()
                .join("\n");
            prompt.push_str(&opts);
            prompt.push_str("\n\nRespond with ONLY the exact value of the correct option, nothing else.");
        } else {
            prompt.push_str(&format!("Question:\n{question_text}\n\nRespond with a short, direct answer only."));
        }

        chat.add(Role::Ai, "🤖 Auto-answering...", None, None);
        chat.is_typing.set(true);

        let provider = app.provider.get_untracked();
        let key = storage::get_api_key(provider).await.unwrap_or_default();
        let local = storage::get_local_settings(provider).await;
        let opts = local_opts(local.url, local.model);

        let answer = match providers::send_message(provider, &prompt, &key, &opts).await {
            Ok(a) => a.trim().to_string(),
            Err(e) => {
                chat.update_last(format!("❌ Auto-answer error: {e}"));
                return;
            }
        };

        let fill = tabs::send_json(
            tab_id,
            &json!({ "action": "fill_answer", "payload": { "inputType": input_type, "value": answer } }),
        )
        .await;

        if fill.get("ok").and_then(Value::as_bool).unwrap_or(false) {
            chat.update_last(format!("✅ Filled answer: **{answer}**"));
        } else {
            let err = fill.get("error").and_then(Value::as_str).unwrap_or("unknown");
            chat.update_last(format!("⚠️ AI answer: **{answer}**\n\n_Could not auto-fill: {err}_"));
        }
    };
    run.await;
    chat.is_typing.set(false);
    app.is_auto_answering.set(false);
}
