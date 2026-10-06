//! Settings view.

use leptos::prelude::*;
use leptos::task::spawn_local;
use serde_json::{json, Value};

use aipage_bindings::{from_js, runtime, to_js};
use aipage_core::i18n::Translation;
use aipage_core::providers::{self, ModelInfo, SendOptions};
use aipage_core::types::ProviderType;
use aipage_core::updates::UpdateChannel;
use aipage_core::{remote_ui, storage};

use crate::icons::{self, icon};
use crate::state::AppState;
use crate::util::set_body_theme;

/// Display label of a model id: the part after the first `:` or `/`.
fn model_label(id: &str) -> String {
    if id.contains(':') {
        id.split_once(':').map(|x| x.1).unwrap_or(id).to_string()
    } else if id.contains('/') {
        id.split_once('/').map(|x| x.1).unwrap_or(id).to_string()
    } else {
        id.to_string()
    }
}

/// `(label, placeholder, hint)` for the API-key field of a provider. Cloud
/// providers have their own strings; local ones share the generic set.
fn api_key_strings(t: &Translation, p: ProviderType) -> (String, String, String) {
    match p {
        ProviderType::OllamaCloud => (
            t.ollama_cloud_api_key.clone(),
            t.ollama_cloud_api_key_placeholder.clone(),
            t.ollama_cloud_api_key_hint.clone(),
        ),
        ProviderType::OpenRouter => (
            t.openrouter_api_key.clone(),
            t.openrouter_api_key_placeholder.clone(),
            t.openrouter_api_key_hint.clone(),
        ),
        ProviderType::OpenAi => (
            t.openai_api_key.clone(),
            t.openai_api_key_placeholder.clone(),
            t.openai_api_key_hint.clone(),
        ),
        ProviderType::Anthropic => (
            t.anthropic_api_key.clone(),
            t.anthropic_api_key_placeholder.clone(),
            t.anthropic_api_key_hint.clone(),
        ),
        ProviderType::Lmstudio | ProviderType::Ollama => {
            (t.api_key.clone(), t.api_key_placeholder.clone(), t.api_key_hint.clone())
        }
    }
}

/// Send `{ action }` to the background and decode its JSON reply (a failed
/// `sendMessage` becomes `{ ok: false, error }`).
async fn background_call(action: &str) -> Value {
    match runtime::send_message(&to_js(&json!({ "action": action }))).await {
        Ok(v) if !v.is_null() && !v.is_undefined() => from_js(&v),
        Ok(_) => json!({ "ok": false, "error": "no reply from the background" }),
        Err(e) => json!({ "ok": false, "error": e.as_string().unwrap_or_else(|| "sendMessage failed".into()) }),
    }
}

/// Human-readable line for the installed UI bundle (`uiBundle.installed` /
/// `ui_bundle_status.installed`), `None` when nothing is installed.
fn describe_installed_bundle(installed: &Value) -> Option<String> {
    let version = installed.get("version")?.as_str()?;
    let channel = installed.get("channel").and_then(Value::as_str).unwrap_or("?");
    let sha = installed.get("sha").and_then(Value::as_str).unwrap_or("");
    let date = installed.get("installedAt").and_then(Value::as_str).unwrap_or("");
    let short_sha = sha.get(..7).unwrap_or(sha);
    let day = date.get(..10).unwrap_or(date);
    let mut s = format!("{version} ({channel}");
    if !short_sha.is_empty() {
        s.push_str(&format!(", {short_sha}"));
    }
    if !day.is_empty() {
        s.push_str(&format!(", {day}"));
    }
    s.push(')');
    Some(s)
}

/// Settings strings for the `extension` part of an update report.
fn describe_extension_result(t: &Translation, report: &Value) -> String {
    if !report.get("ok").and_then(Value::as_bool).unwrap_or(false) {
        let err = report.get("error").and_then(Value::as_str).unwrap_or("unknown error");
        return t.update_check_failed.replace("{error}", err);
    }
    let ext = &report["extension"];
    let current = ext.get("current").and_then(Value::as_str).unwrap_or("?");
    match (ext.get("updateAvailable").and_then(Value::as_bool), ext.get("remote").and_then(Value::as_str)) {
        (Some(true), Some(remote)) => t.update_extension_available.replace("{version}", remote),
        _ => t.update_extension_up_to_date.replace("{version}", current),
    }
}

/// Settings strings for the `uiBundle` part of an update report; `None`
/// when there is nothing to say (bundle updates off).
fn describe_bundle_result(t: &Translation, report: &Value) -> Option<String> {
    if !report.get("ok").and_then(Value::as_bool).unwrap_or(false) {
        let err = report.get("error").and_then(Value::as_str).unwrap_or("unknown error");
        return Some(t.update_check_failed.replace("{error}", err));
    }
    let b = &report["uiBundle"];
    let version = b.get("version").and_then(Value::as_str).unwrap_or("?");
    Some(match b.get("result").and_then(Value::as_str).unwrap_or("") {
        "installed" => t.ui_bundle_result_installed.replace("{version}", version),
        "up_to_date" => t.ui_bundle_result_up_to_date.clone(),
        "not_available" => t.ui_bundle_result_not_available.clone(),
        "older_than_extension" => t.ui_bundle_result_older.replace("{version}", version),
        "error" => t.update_check_failed.replace("{error}", b.get("error").and_then(Value::as_str).unwrap_or("?")),
        _ => return None,
    })
}

/// Everything the update controls share between the two settings cards.
#[derive(Clone, Copy)]
struct UpdateControls {
    channel: RwSignal<String>,
    checking: RwSignal<bool>,
    extension_result: RwSignal<Option<String>>,
    bundle_enabled: RwSignal<bool>,
    bundle_installed: RwSignal<Option<String>>,
    bundle_result: RwSignal<Option<String>>,
}

impl UpdateControls {
    fn new() -> Self {
        Self {
            channel: RwSignal::new(UpdateChannel::default().as_str().to_string()),
            checking: RwSignal::new(false),
            extension_result: RwSignal::new(None),
            bundle_enabled: RwSignal::new(false),
            bundle_installed: RwSignal::new(None),
            bundle_result: RwSignal::new(None),
        }
    }

    /// Load the stored settings and the installed-bundle status.
    async fn load(self) {
        self.channel.set(storage::get_update_channel().await.as_str().to_string());
        self.bundle_enabled.set(storage::get_ui_bundle_update_enabled().await);
        let status = background_call("ui_bundle_status").await;
        self.bundle_installed.set(describe_installed_bundle(&status["installed"]));
    }

    /// Settings "Check now": run the full check in the background and show
    /// both results.
    fn check_now(self, app: AppState) {
        if self.checking.get_untracked() {
            return;
        }
        self.checking.set(true);
        self.extension_result.set(Some(app.tr().update_checking));
        self.bundle_result.set(None);
        spawn_local(async move {
            let report = background_call("check_updates").await;
            let t = app.tr();
            self.extension_result.set(Some(describe_extension_result(&t, &report)));
            self.bundle_result.set(describe_bundle_result(&t, &report));
            self.bundle_installed.set(describe_installed_bundle(&report["uiBundle"]["installed"]));
            self.checking.set(false);
        });
    }
}

#[component]
pub fn SettingsView(#[prop(into)] on_close: Callback<()>) -> impl IntoView {
    let app = use_context::<AppState>().unwrap();

    let api_key = RwSignal::new(String::new());
    let theme = RwSignal::new("default".to_string());
    let global_theme = RwSignal::new(false);
    let auto_update = RwSignal::new(false);
    let updates = UpdateControls::new();
    let base_url = RwSignal::new(String::new());
    let model_name = RwSignal::new(String::new());
    let available_models = RwSignal::<Vec<ModelInfo>>::new(Vec::new());
    let loading_models = RwSignal::new(false);
    let fetch_error = RwSignal::<Option<String>>::new(None);
    let auto_answer = RwSignal::new(false);
    let image_gen_enabled = RwSignal::new(false);
    let image_gen_provider = RwSignal::new("ollama-svg".to_string());
    let image_gen_sd_url = RwSignal::new("http://localhost:7860".to_string());
    let image_gen_size = RwSignal::new("1024x1024".to_string());
    let remote_ui_enabled = RwSignal::new(true);
    let remote_ui_url = RwSignal::new(String::new());

    // Current backend == current provider.
    let backend = move || app.provider.get();

    let fetch_models = move |url: String, key: String| {
        let provider = app.provider.get_untracked();
        loading_models.set(true);
        fetch_error.set(None);
        spawn_local(async move {
            let opts = SendOptions { base_url: Some(url), model_name: None };
            let models = providers::get_models(provider, &key, &opts).await;
            if models.is_empty() {
                fetch_error.set(Some("No models found".to_string()));
            }
            available_models.set(models);
            loading_models.set(false);
        });
    };

    // (Re)load whenever the provider changes.
    Effect::new(move |_| {
        let provider = app.provider.get();
        spawn_local(async move {
            let key = storage::get_api_key(provider).await.unwrap_or_default();
            api_key.set(key.clone());
            theme.set(storage::get_theme_preference().await);
            global_theme.set(storage::get_global_theme_enabled().await);
            auto_update.set(storage::get_auto_update_enabled().await);
            let local = storage::get_local_settings(provider).await;
            model_name.set(local.model.clone());
            auto_answer.set(storage::get_auto_answer_enabled().await);
            image_gen_enabled.set(storage::get_image_gen_enabled().await);
            image_gen_provider.set(storage::get_image_gen_provider().await);
            image_gen_sd_url.set(storage::get_image_gen_sd_url().await);
            image_gen_size.set(storage::get_image_gen_size().await);
            remote_ui_enabled.set(storage::get_remote_ui_enabled().await);
            remote_ui_url.set(storage::get_remote_ui_url().await);
            updates.load().await;

            let url = if local.url.is_empty() {
                providers::default_base_url(provider).to_string()
            } else {
                local.url
            };
            base_url.set(url.clone());
            fetch_models(url, key);
        });
    });

    let save = move |_| {
        let provider = app.provider.get_untracked();
        let key = api_key.get_untracked();
        if key.is_empty() && provider.requires_api_key() {
            if let Some(w) = web_sys::window() {
                let _ = w.alert_with_message(&app.tr().alert_please_enter_key);
            }
            return;
        }
        let (bu, model) = (base_url.get_untracked(), model_name.get_untracked());
        let (aa, ig, igp, igu, igs) = (
            auto_answer.get_untracked(),
            image_gen_enabled.get_untracked(),
            image_gen_provider.get_untracked(),
            image_gen_sd_url.get_untracked(),
            image_gen_size.get_untracked(),
        );
        spawn_local(async move {
            storage::set_api_key(provider, &key).await;
            storage::save_auto_answer_enabled(aa).await;
            storage::save_image_gen_enabled(ig).await;
            storage::save_image_gen_provider(&igp).await;
            storage::save_image_gen_sd_url(&igu).await;
            storage::save_image_gen_size(&igs).await;
            storage::save_local_settings(provider, &bu, &model).await;
            if let Some(w) = web_sys::window() {
                let _ = w.alert_with_message(&app.tr().alert_settings_saved);
            }
            on_close.run(());
        });
    };

    let change_backend = move |ev| {
        let v = event_target_value(&ev);
        let p = ProviderType::from_str_or_default(&v);
        app.provider.set(p);
        spawn_local(async move {
            storage::save_provider_backend_preference(p).await;
            storage::save_provider_preference(p).await;
        });
    };

    let change_theme = move |ev| {
        let v = event_target_value(&ev);
        theme.set(v.clone());
        set_body_theme(&v);
        spawn_local(async move { storage::save_theme_preference(&v).await });
    };

    let change_language = move |ev| {
        let v = event_target_value(&ev);
        app.language.set(v.clone());
        spawn_local(async move { storage::set_language(&v).await });
    };

    let change_channel = move |ev| {
        let v = event_target_value(&ev);
        let channel = UpdateChannel::from_str_or_default(&v);
        updates.channel.set(channel.as_str().to_string());
        updates.extension_result.set(None);
        updates.bundle_result.set(None);
        spawn_local(async move { storage::save_update_channel(channel).await });
    };

    let select_style = "background: var(--input-bg); border: 1px solid var(--border-color); color: var(--text-color);";

    view! {
        <div class="flex flex-col h-full overflow-y-auto px-4 py-6" style="background: var(--bg-color)">
            <div class="max-w-[500px] mx-auto w-full space-y-6">
                <header class="flex flex-col gap-1">
                    <h2 class="text-2xl font-bold tracking-tight text-foreground">{move || app.tr().settings_title}</h2>
                    <p class="text-sm text-muted-foreground">{move || app.tr().settings_description}</p>
                </header>

                // Provider engine
                <Card>
                    <CardHeader gradient="linear-gradient(135deg, #2c70a3, #3b82f6)" icon_svg=icons::ZAP title=Signal::derive(move || app.tr().provider_engine)/>
                    <div class="p-4 space-y-2">
                        <label class="text-xs uppercase font-bold tracking-wider opacity-70">{move || app.tr().engine_mode}</label>
                        <select class="w-full h-9 rounded-lg px-2 outline-none" style=select_style prop:value=move || app.provider.get().as_str().to_string() on:change=change_backend>
                            <option value="ollama-cloud">{move || app.tr().ollama_cloud_mode}</option>
                            <option value="openrouter">{move || app.tr().provider_openrouter}</option>
                            <option value="openai">{move || app.tr().provider_openai}</option>
                            <option value="anthropic">{move || app.tr().provider_anthropic}</option>
                            <option value="ollama">{move || app.tr().provider_ollama}</option>
                            <option value="lmstudio">{move || app.tr().provider_lmstudio}</option>
                        </select>
                    </div>
                </Card>

                // Model & auth
                <Card>
                    <CardHeader gradient="linear-gradient(135deg, #0369a1, #38bdf8)" icon_svg=icons::SETTINGS2 title=Signal::derive(move || app.tr().model_and_auth)/>
                    <div class="p-4 space-y-4">
                        <div class="space-y-2">
                            <label class="text-xs uppercase font-bold tracking-wider opacity-70">{move || app.tr().base_url}</label>
                            <input class="w-full h-9 rounded-lg px-2 outline-none" style=select_style prop:value=move || base_url.get() on:input=move |ev| base_url.set(event_target_value(&ev)) placeholder=move || providers::default_base_url(backend())/>
                        </div>
                        <div class="space-y-2">
                            <label class="text-xs uppercase font-bold tracking-wider opacity-70">{move || app.tr().model}</label>
                            {move || if loading_models.get() {
                                view! { <div class="flex items-center gap-2 text-xs text-muted-foreground py-2">{icon(icons::REFRESH_CW, "w-3 h-3 animate-spin")}{move || app.tr().loading}</div> }.into_any()
                            } else {
                                let models = available_models.get();
                                view! {
                                    <div class="flex gap-2">
                                        <select class="flex-1 h-9 rounded-lg px-2 outline-none" style=select_style prop:value=move || model_name.get() on:change=move |ev| model_name.set(event_target_value(&ev))>
                                            {if models.is_empty() {
                                                view! { <option value="" disabled=true>{app.tr().no_models_found}</option> }.into_any()
                                            } else {
                                                models.into_iter().map(|m| {
                                                    let id = m.id.clone();
                                                    view! { <option value=id.clone()>{format!("{} ({})", model_label(&id), m.provider)}</option> }
                                                }).collect_view().into_any()
                                            }}
                                        </select>
                                        <button class="h-9 px-3 rounded-lg border shrink-0" style="border-color: var(--border-color)"
                                            title=app.tr().refresh_models
                                            on:click=move |_| {
                                                fetch_models(base_url.get_untracked(), api_key.get_untracked());
                                            }>
                                            {icon(icons::REFRESH_CW, "w-4 h-4")}
                                        </button>
                                    </div>
                                }.into_any()
                            }}
                            {move || fetch_error.get().map(|e| view! { <p class="text-[10px] text-destructive mt-1 flex items-center gap-1">{icon(icons::ALERT_CIRCLE, "w-3 h-3")}{e}</p> })}
                        </div>
                        <div class="space-y-2">
                            <label class="text-xs uppercase font-bold tracking-wider opacity-70">{move || api_key_strings(&app.tr(), backend()).0}</label>
                            <input type="password" class="w-full h-9 rounded-lg px-2 outline-none" style=select_style
                                prop:value=move || api_key.get() on:input=move |ev| api_key.set(event_target_value(&ev))
                                placeholder=move || api_key_strings(&app.tr(), backend()).1/>
                            <p class="text-[10px] text-muted-foreground opacity-70">{move || api_key_strings(&app.tr(), backend()).2}</p>
                        </div>
                    </div>
                </Card>

                // Appearance & app
                <Card>
                    <CardHeader gradient="linear-gradient(135deg, #2e7d32, #4ade80)" icon_svg=icons::PALETTE title=Signal::derive(move || app.tr().appearance_and_app)/>
                    <div class="p-4 space-y-4">
                        <div class="flex items-center justify-between gap-2">
                            <div class="space-y-0.5">
                                <label class="text-sm font-medium">{move || app.tr().theme_interface}</label>
                                <p class="text-[11px] text-muted-foreground">{move || app.tr().theme_description}</p>
                            </div>
                            <select class="w-[140px] h-9 rounded-lg px-2 outline-none" style=select_style prop:value=move || theme.get() on:change=change_theme>
                                <option value="default">{move || app.tr().theme_edu_page}</option>
                                <option value="sms">{move || app.tr().theme_imessage}</option>
                                <option value="gradient">{move || app.tr().theme_messenger}</option>
                                <option value="discord">{move || app.tr().theme_discord}</option>
                                <option value="tokyo">{move || app.tr().theme_tokyo}</option>
                                <option value="mono">{move || app.tr().theme_mono}</option>
                            </select>
                        </div>
                        <Toggle label=Signal::derive(move || app.tr().apply_theme_global) checked=global_theme on_toggle=Callback::new(move |v: bool| { global_theme.set(v); spawn_local(async move { storage::save_global_theme_enabled(v).await }); })/>
                        <Toggle label=Signal::derive(move || app.tr().auto_update) checked=auto_update on_toggle=Callback::new(move |v: bool| { auto_update.set(v); spawn_local(async move { storage::save_auto_update_enabled(v).await }); })/>
                        <div class="space-y-2">
                            <label class="text-xs uppercase font-bold tracking-wider opacity-70">{move || app.tr().update_channel}</label>
                            <div class="flex gap-2">
                                <select id="update-channel" class="flex-1 h-9 rounded-lg px-2 outline-none" style=select_style prop:value=move || updates.channel.get() on:change=change_channel>
                                    <option value="stable">{move || app.tr().update_channel_stable}</option>
                                    <option value="nightly">{move || app.tr().update_channel_nightly}</option>
                                </select>
                                <button id="update-check-now" class="h-9 px-3 rounded-lg border shrink-0 text-xs" style="border-color: var(--border-color)"
                                    disabled=move || updates.checking.get()
                                    title=move || app.tr().update_check_now
                                    on:click=move |_| updates.check_now(app)>
                                    {icon(icons::REFRESH_CW, "w-4 h-4")}
                                </button>
                            </div>
                            <p class="text-[10px] text-muted-foreground opacity-70">{move || app.tr().update_channel_hint}</p>
                            {move || updates.extension_result.get().map(|s| view! { <p id="update-extension-result" class="text-[11px] text-muted-foreground">{s}</p> })}
                        </div>
                        <div class="space-y-2">
                            <div class="flex items-center gap-2 mb-1">
                                {icon(icons::LANGUAGES, "w-4 h-4 text-muted-foreground")}
                                <label class="text-xs uppercase font-bold tracking-wider opacity-70">{move || app.tr().language}</label>
                            </div>
                            <select class="w-full h-9 rounded-lg px-2 outline-none" style=select_style prop:value=move || app.language.get() on:change=change_language>
                                <option value="sk">"Slovenčina"</option>
                                <option value="en">"English"</option>
                                <option value="cs">"Čeština"</option>
                                <option value="de">"Deutsch"</option>
                                <option value="hu">"Magyar"</option>
                            </select>
                        </div>
                    </div>
                </Card>

                // Image generation
                <Card>
                    <CardHeader gradient="linear-gradient(135deg, #db2777, #f472b6)" icon_svg=icons::IMAGE title=Signal::derive(move || app.tr().image_gen)/>
                    <div class="p-4 space-y-4">
                        <Toggle label=Signal::derive(move || app.tr().image_gen_enabled) checked=image_gen_enabled on_toggle=Callback::new(move |v: bool| image_gen_enabled.set(v))/>
                        <Show when=move || image_gen_enabled.get()>
                            <div class="space-y-4">
                                <div class="space-y-2">
                                    <label class="text-xs uppercase font-bold tracking-wider opacity-70">{move || app.tr().image_gen_provider}</label>
                                    <select class="w-full h-9 rounded-lg px-2 outline-none" style=select_style prop:value=move || image_gen_provider.get() on:change=move |ev| image_gen_provider.set(event_target_value(&ev))>
                                        <option value="ollama-svg">{move || app.tr().image_gen_ollama_svg}</option>
                                        <option value="sdwebui">{move || app.tr().image_gen_sd_webui}</option>
                                    </select>
                                </div>
                                <Show when=move || image_gen_provider.get() == "ollama-svg">
                                    <div class="space-y-2">
                                        <label class="text-xs uppercase font-bold tracking-wider opacity-70">{move || app.tr().image_gen_size}</label>
                                        <select class="w-full h-9 rounded-lg px-2 outline-none" style=select_style prop:value=move || image_gen_size.get() on:change=move |ev| image_gen_size.set(event_target_value(&ev))>
                                            <option value="1024x1024">"1024×1024"</option>
                                            <option value="1024x1792">"1024×1792 (Portrait)"</option>
                                            <option value="1792x1024">"1792×1024 (Landscape)"</option>
                                        </select>
                                    </div>
                                </Show>
                                <Show when=move || image_gen_provider.get() == "sdwebui">
                                    <div class="space-y-2">
                                        <label class="text-xs uppercase font-bold tracking-wider opacity-70">{move || app.tr().image_gen_sd_url}</label>
                                        <input class="w-full h-9 rounded-lg px-2 outline-none" style=select_style prop:value=move || image_gen_sd_url.get() on:input=move |ev| image_gen_sd_url.set(event_target_value(&ev)) placeholder=move || app.tr().image_gen_sd_url_placeholder/>
                                    </div>
                                </Show>
                            </div>
                        </Show>
                    </div>
                </Card>

                // Hosted (remote) UI + the GitHub-downloaded sidebar bundle
                <RemoteUiSection enabled=remote_ui_enabled url=remote_ui_url updates=updates/>

                // Exam tools
                <Card>
                    <CardHeader gradient="linear-gradient(135deg, #7c3aed, #a78bfa)" icon_svg=icons::WAND2 title=Signal::derive(|| "Exam Tools".to_string())/>
                    <div class="p-4">
                        <Toggle label=Signal::derive(|| "Auto-answer mode".to_string()) checked=auto_answer on_toggle=Callback::new(move |v: bool| auto_answer.set(v))/>
                    </div>
                </Card>

                <footer class="pt-4 flex flex-col gap-3">
                    <button class="w-full font-bold h-11 rounded-xl text-white border-0" style="background: var(--message-user-bg); box-shadow: 0 4px 14px color-mix(in srgb, var(--accent-color) 28%, transparent);" on:click=save>
                        {move || app.tr().save_key}
                    </button>
                    <button class="w-full text-muted-foreground hover:text-foreground py-2" on:click=move |_| on_close.run(())>
                        {move || app.tr().back_to_chat}
                    </button>
                </footer>
            </div>
        </div>
    }
}

/// Self-contained "Hosted UI" card: the auto-updating remote UI toggle, the
/// advanced URL override, and the second UI-update mode — the sidebar bundle
/// downloaded from GitHub releases (precedence: hosted → downloaded bundle →
/// bundled). Everything persists immediately; the content script reloads the
/// sidebar iframe when a remote-UI key changes.
#[component]
fn RemoteUiSection(enabled: RwSignal<bool>, url: RwSignal<String>, updates: UpdateControls) -> impl IntoView {
    let app = use_context::<AppState>().unwrap();
    let input_style = "background: var(--input-bg); border: 1px solid var(--border-color); color: var(--text-color);";
    let url_invalid = move || {
        let u = url.get();
        !u.trim().is_empty() && remote_ui::normalize_remote_ui_url(&u).is_none()
    };
    let commit_url = move |_| {
        let raw = url.get_untracked();
        let normalized = remote_ui::normalize_remote_ui_url(&raw).unwrap_or_default();
        url.set(normalized.clone());
        spawn_local(async move { storage::save_remote_ui_url(&normalized).await });
    };

    let bundle_label = move || {
        let t = app.tr();
        let channel = match UpdateChannel::from_str_or_default(&updates.channel.get()) {
            UpdateChannel::Stable => t.update_channel_stable.clone(),
            UpdateChannel::Nightly => t.update_channel_nightly.clone(),
        };
        t.ui_bundle_update.replace("{channel}", &channel)
    };
    let toggle_bundle = move |v: bool| {
        updates.bundle_enabled.set(v);
        updates.bundle_result.set(None);
        spawn_local(async move {
            storage::save_ui_bundle_update_enabled(v).await;
            if v {
                // Fetch the bundle right away instead of waiting for the hourly alarm.
                updates.check_now(app);
            }
        });
    };
    let use_bundled = move |_| {
        updates.bundle_enabled.set(false);
        spawn_local(async move {
            storage::save_ui_bundle_update_enabled(false).await;
            let r = background_call("ui_bundle_clear").await;
            let t = app.tr();
            if r.get("ok").and_then(Value::as_bool).unwrap_or(false) {
                updates.bundle_installed.set(None);
                updates.bundle_result.set(Some(t.ui_bundle_cleared));
            } else {
                let err = r.get("error").and_then(Value::as_str).unwrap_or("?");
                updates.bundle_result.set(Some(t.update_check_failed.replace("{error}", err)));
            }
        });
    };

    view! {
        <Card>
            <CardHeader gradient="linear-gradient(135deg, #0f766e, #2dd4bf)" icon_svg=icons::CLOUD title=Signal::derive(move || app.tr().remote_ui)/>
            <div class="p-4 space-y-4">
                <Toggle label=Signal::derive(move || app.tr().remote_ui_enabled) checked=enabled on_toggle=Callback::new(move |v: bool| {
                    enabled.set(v);
                    spawn_local(async move { storage::save_remote_ui_enabled(v).await });
                })/>
                <p class="text-[11px] text-muted-foreground">{move || app.tr().remote_ui_description}</p>
                <Show when=move || enabled.get()>
                    <div class="space-y-2">
                        <label class="text-xs uppercase font-bold tracking-wider opacity-70">{move || app.tr().remote_ui_url}</label>
                        <input id="remote-ui-url" class="w-full h-9 rounded-lg px-2 outline-none" style=input_style
                            prop:value=move || url.get()
                            on:input=move |ev| url.set(event_target_value(&ev))
                            on:change=commit_url
                            placeholder=remote_ui::DEFAULT_REMOTE_UI_URL/>
                        <p class="text-[10px] text-muted-foreground opacity-70">{move || app.tr().remote_ui_url_hint}</p>
                        <Show when=url_invalid>
                            <p class="text-[10px] text-destructive flex items-center gap-1">{icon(icons::ALERT_CIRCLE, "w-3 h-3")}{remote_ui::DEFAULT_REMOTE_UI_URL}</p>
                        </Show>
                    </div>
                </Show>

                // Second UI-update mode: the bundle downloaded from GitHub releases.
                <div class="space-y-3 pt-3 border-t" style="border-color: var(--border-color)">
                    <Toggle label=Signal::derive(bundle_label) checked=updates.bundle_enabled on_toggle=Callback::new(toggle_bundle)/>
                    <p class="text-[11px] text-muted-foreground">{move || app.tr().ui_bundle_description}</p>
                    <p id="ui-bundle-installed" class="text-[11px]">
                        <span class="font-medium">{move || app.tr().ui_bundle_installed}": "</span>
                        {move || updates.bundle_installed.get().unwrap_or_else(|| app.tr().ui_bundle_none)}
                    </p>
                    <div class="flex gap-2">
                        <button id="ui-bundle-check-now" class="flex-1 h-9 px-3 rounded-lg border text-xs" style="border-color: var(--border-color)"
                            disabled=move || updates.checking.get()
                            on:click=move |_| updates.check_now(app)>
                            {move || if updates.checking.get() { app.tr().update_checking } else { app.tr().ui_bundle_check_now }}
                        </button>
                        <button id="ui-bundle-use-bundled" class="flex-1 h-9 px-3 rounded-lg border text-xs" style="border-color: var(--border-color)"
                            disabled=move || updates.checking.get()
                            on:click=use_bundled>
                            {move || app.tr().ui_bundle_use_bundled}
                        </button>
                    </div>
                    {move || updates.bundle_result.get().map(|s| view! { <p id="ui-bundle-result" class="text-[11px] text-muted-foreground">{s}</p> })}
                </div>
            </div>
        </Card>
    }
}

#[component]
fn Card(children: Children) -> impl IntoView {
    view! { <div class="rounded-xl border overflow-hidden" style="border-color: var(--border-color)">{children()}</div> }
}

#[component]
fn CardHeader(gradient: &'static str, icon_svg: &'static str, #[prop(into)] title: Signal<String>) -> impl IntoView {
    view! {
        <div class="py-4 px-6 bg-muted/10">
            <div class="flex items-center gap-2">
                <div class="w-[22px] h-[22px] rounded-lg flex items-center justify-center shrink-0 text-white" style=format!("background: {gradient}")>
                    {icon(icon_svg, "w-[11px] h-[11px]")}
                </div>
                <span class="text-sm font-semibold">{move || title.get()}</span>
            </div>
        </div>
    }
}

#[component]
fn Toggle(#[prop(into)] label: Signal<String>, checked: RwSignal<bool>, #[prop(into)] on_toggle: Callback<bool>) -> impl IntoView {
    view! {
        <div class="flex items-center justify-between gap-2">
            <label class="text-sm font-medium cursor-pointer">{move || label.get()}</label>
            <button
                role="switch"
                class=move || format!("w-9 h-5 rounded-full transition-colors relative shrink-0 {}", if checked.get() { "bg-primary" } else { "bg-muted" })
                style=move || if checked.get() { "background: var(--accent-color)".to_string() } else { "background: var(--border-color)".to_string() }
                on:click=move |_| on_toggle.run(!checked.get_untracked())
            >
                <span class=move || format!("block w-4 h-4 bg-white rounded-full absolute top-0.5 transition-all {}", if checked.get() { "left-[18px]" } else { "left-0.5" })></span>
            </button>
        </div>
    }
}
