//! Settings view. Mirrors `components/Settings/SettingsView.tsx`. Uses native
//! `<select>` elements in place of the shadcn Select (same behavior + storage).

use leptos::*;

use aipage_core::providers::{self, ModelInfo, SendOptions};
use aipage_core::types::ProviderType;
use aipage_core::storage;

use crate::icons::{self, icon};
use crate::state::AppState;

fn set_body_theme(theme: &str) {
    if let Some(body) = web_sys::window().and_then(|w| w.document()).and_then(|d| d.body()) {
        let _ = body.set_attribute("data-theme", theme);
    }
}

/// Transform a model id into a display label (mirrors the TS slicing).
fn model_label(id: &str) -> String {
    if id.contains(':') {
        id.split_once(':').map(|x| x.1).unwrap_or(id).to_string()
    } else if id.contains('/') {
        id.split_once('/').map(|x| x.1).unwrap_or(id).to_string()
    } else {
        id.to_string()
    }
}

#[component]
pub fn SettingsView(#[prop(into)] on_close: Callback<()>) -> impl IntoView {
    let app = use_context::<AppState>().unwrap();

    let api_key = create_rw_signal(String::new());
    let theme = create_rw_signal("default".to_string());
    let global_theme = create_rw_signal(false);
    let auto_update = create_rw_signal(false);
    let base_url = create_rw_signal(String::new());
    let model_name = create_rw_signal(String::new());
    let available_models = create_rw_signal::<Vec<ModelInfo>>(Vec::new());
    let loading_models = create_rw_signal(false);
    let fetch_error = create_rw_signal::<Option<String>>(None);
    let auto_answer = create_rw_signal(false);
    let image_gen_enabled = create_rw_signal(false);
    let image_gen_provider = create_rw_signal("ollama-svg".to_string());
    let image_gen_sd_url = create_rw_signal("http://localhost:7860".to_string());
    let image_gen_size = create_rw_signal("1024x1024".to_string());

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
    create_effect(move |_| {
        let provider = app.provider.get();
        spawn_local(async move {
            let key = storage::get_api_key(provider).await.unwrap_or_default();
            api_key.set(key.clone());
            theme.set(storage::get_theme_preference().await);
            global_theme.set(read_bool("ai_sidebar_global").await);
            auto_update.set(read_bool("autoUpdate").await);
            let local = storage::get_local_settings(provider).await;
            model_name.set(local.model.clone());
            auto_answer.set(storage::get_auto_answer_enabled().await);
            image_gen_enabled.set(storage::get_image_gen_enabled().await);
            image_gen_provider.set(storage::get_image_gen_provider().await);
            image_gen_sd_url.set(storage::get_image_gen_sd_url().await);
            image_gen_size.set(storage::get_image_gen_size().await);

            match provider {
                ProviderType::OllamaCloud => {
                    let url = if local.url.is_empty() { "https://ollama.com".to_string() } else { local.url };
                    base_url.set(url.clone());
                    fetch_models(url, key);
                }
                ProviderType::Lmstudio | ProviderType::Ollama => {
                    let default_url = if provider == ProviderType::Lmstudio {
                        "http://localhost:1234/v1"
                    } else {
                        "http://localhost:11434"
                    };
                    let url = if local.url.is_empty() { default_url.to_string() } else { local.url };
                    base_url.set(url.clone());
                    fetch_models(url, key);
                }
            }
        });
    });

    let save = move |_| {
        let provider = app.provider.get_untracked();
        let key = api_key.get_untracked();
        if key.is_empty() && provider == ProviderType::OllamaCloud {
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
            on_close.call(());
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
                            <input class="w-full h-9 rounded-lg px-2 outline-none" style=select_style prop:value=move || base_url.get() on:input=move |ev| base_url.set(event_target_value(&ev)) placeholder="https://ollama.com"/>
                        </div>
                        <div class="space-y-2">
                            <label class="text-xs uppercase font-bold tracking-wider opacity-70">{move || app.tr().model}</label>
                            {move || if loading_models.get() {
                                view! { <div class="flex items-center gap-2 text-xs text-muted-foreground py-2">{icon(icons::REFRESH_CW, "w-3 h-3 animate-spin")}{move || app.tr().loading}</div> }.into_view()
                            } else {
                                let models = available_models.get();
                                view! {
                                    <div class="flex gap-2">
                                        <select class="flex-1 h-9 rounded-lg px-2 outline-none" style=select_style prop:value=move || model_name.get() on:change=move |ev| model_name.set(event_target_value(&ev))>
                                            {if models.is_empty() {
                                                view! { <option value="" disabled=true>{app.tr().no_models_found}</option> }.into_view()
                                            } else {
                                                models.into_iter().map(|m| {
                                                    let id = m.id.clone();
                                                    view! { <option value=id.clone()>{format!("{} ({})", model_label(&id), m.provider)}</option> }
                                                }).collect_view()
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
                                }.into_view()
                            }}
                            {move || fetch_error.get().map(|e| view! { <p class="text-[10px] text-destructive mt-1 flex items-center gap-1">{icon(icons::ALERT_CIRCLE, "w-3 h-3")}{e}</p> })}
                        </div>
                        <div class="space-y-2">
                            <label class="text-xs uppercase font-bold tracking-wider opacity-70">{move || if backend() == ProviderType::OllamaCloud { app.tr().ollama_cloud_api_key } else { app.tr().api_key }}</label>
                            <input type="password" class="w-full h-9 rounded-lg px-2 outline-none" style=select_style
                                prop:value=move || api_key.get() on:input=move |ev| api_key.set(event_target_value(&ev))
                                placeholder=move || if backend() == ProviderType::OllamaCloud { app.tr().ollama_cloud_api_key_placeholder } else { app.tr().api_key_placeholder }/>
                            <p class="text-[10px] text-muted-foreground opacity-70">{move || if backend() == ProviderType::OllamaCloud { app.tr().ollama_cloud_api_key_hint } else { app.tr().api_key_hint }}</p>
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
                        <Toggle label=Signal::derive(move || app.tr().apply_theme_global) checked=global_theme on_toggle=Callback::new(move |v: bool| { global_theme.set(v); spawn_local(async move { write_bool("ai_sidebar_global", v).await }); })/>
                        <Toggle label=Signal::derive(move || app.tr().auto_update) checked=auto_update on_toggle=Callback::new(move |v: bool| { auto_update.set(v); spawn_local(async move { write_bool("autoUpdate", v).await }); })/>
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
                    <button class="w-full text-muted-foreground hover:text-foreground py-2" on:click=move |_| on_close.call(())>
                        {move || app.tr().back_to_chat}
                    </button>
                </footer>
            </div>
        </div>
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
                on:click=move |_| on_toggle.call(!checked.get_untracked())
            >
                <span class=move || format!("block w-4 h-4 bg-white rounded-full absolute top-0.5 transition-all {}", if checked.get() { "left-[18px]" } else { "left-0.5" })></span>
            </button>
        </div>
    }
}

async fn read_bool(key: &str) -> bool {
    use wasm_bindgen::JsValue;
    let arr = js_sys::Array::of1(&JsValue::from_str(key));
    match aipage_bindings::storage::local_get(arr.as_ref()).await {
        Ok(v) => js_sys::Reflect::get(&v, &JsValue::from_str(key)).map(|x| x.is_truthy()).unwrap_or(false),
        Err(_) => false,
    }
}

async fn write_bool(key: &str, value: bool) {
    use wasm_bindgen::JsValue;
    let obj = js_sys::Object::new();
    let _ = js_sys::Reflect::set(&obj, &JsValue::from_str(key), &JsValue::from_bool(value));
    let _ = aipage_bindings::storage::local_set(obj.as_ref()).await;
}
