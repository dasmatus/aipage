//! Root sidebar component. Mirrors `App.tsx`: header, view switching and the
//! initial storage-driven setup.

use leptos::*;

use aipage_core::storage;
use aipage_core::types::ProviderType;

use crate::components::{InputArea, MessageList, SettingsView, WidgetsView};
use crate::icons::{self, icon};
use crate::state::{auto_answer, AppState, ChatState, View};
use crate::util::classes;

fn set_body_theme(theme: &str) {
    if let Some(body) = web_sys::window().and_then(|w| w.document()).and_then(|d| d.body()) {
        let _ = body.set_attribute("data-theme", theme);
    }
}

fn initials_from_hash() -> Option<String> {
    let hash = web_sys::window()?.location().hash().ok()?;
    let idx = hash.find("initials=")?;
    let raw = &hash[idx + "initials=".len()..];
    let decoded = js_sys::decode_uri_component(raw).ok().and_then(|v| v.as_string()).unwrap_or_else(|| raw.to_string());
    (!decoded.is_empty()).then_some(decoded)
}

#[component]
pub fn App() -> impl IntoView {
    let app = AppState::new();
    let chat = ChatState::new();
    provide_context(app);
    provide_context(chat);

    let initialized = create_rw_signal(false);

    // Initial load from storage.
    spawn_local(async move {
        let provider = storage::get_provider_preference().await;
        app.provider.set(provider);
        let key = storage::get_api_key(provider).await;
        app.language.set(storage::get_language().await);
        app.image_gen_enabled.set(storage::get_image_gen_enabled().await);
        app.image_gen_provider.set(storage::get_image_gen_provider().await);
        app.image_gen_sd_url.set(storage::get_image_gen_sd_url().await);
        app.image_gen_model.set(storage::get_image_gen_model().await);
        app.image_gen_size.set(storage::get_image_gen_size().await);
        app.auto_answer_enabled.set(storage::get_auto_answer_enabled().await);
        set_body_theme(&storage::get_theme_preference().await);

        if let Some(i) = initials_from_hash() {
            app.user_initials.set(i);
        }

        // Show settings if a cloud provider has no key.
        let is_local = matches!(provider, ProviderType::Lmstudio | ProviderType::Ollama);
        if key.as_deref().unwrap_or("").is_empty() && !is_local {
            app.view.set(View::Settings);
        }
        initialized.set(true);
    });

    // Refresh app-level state when settings close.
    let on_settings_close = Callback::new(move |_| {
        spawn_local(async move {
            app.image_gen_enabled.set(storage::get_image_gen_enabled().await);
            app.image_gen_provider.set(storage::get_image_gen_provider().await);
            app.image_gen_sd_url.set(storage::get_image_gen_sd_url().await);
            app.image_gen_model.set(storage::get_image_gen_model().await);
            app.image_gen_size.set(storage::get_image_gen_size().await);
            app.auto_answer_enabled.set(storage::get_auto_answer_enabled().await);
        });
        app.view.set(View::Chat);
    });

    let is_secondary = move || app.view.get() != View::Chat;

    let chat_class = move || classes(&[
        "flex-1 flex flex-col transition-all duration-500 absolute inset-0",
        if app.view.get() == View::Chat { "translate-x-0 opacity-100" } else { "-translate-x-full opacity-0 pointer-events-none hidden" },
    ]);
    let settings_class = move || classes(&[
        "flex-1 transition-all duration-500 absolute inset-0",
        if app.view.get() == View::Settings { "translate-x-0 opacity-100" } else { "translate-x-full opacity-0 pointer-events-none hidden" },
    ]);
    let widgets_class = move || classes(&[
        "flex-1 transition-all duration-500 absolute inset-0",
        if app.view.get() == View::Widgets { "translate-x-0 opacity-100" } else { "translate-x-full opacity-0 pointer-events-none hidden" },
    ]);

    view! {
        <Show when=move || initialized.get() fallback=|| view! { <div></div> }>
            <div class="flex flex-col h-screen text-foreground overflow-hidden font-sans" style="background: var(--bg-color)">
                // Header
                <header
                    class="flex items-center justify-between px-4 border-b backdrop-blur-md z-50 shrink-0"
                    style="height: var(--header-height); background: var(--header-bg); border-color: var(--border-color);"
                >
                    <div class="flex items-center gap-2">
                        {move || if is_secondary() {
                            view! {
                                <button class="h-8 w-8 rounded-lg flex items-center justify-center hover:bg-black/5" on:click=move |_| app.view.set(View::Chat)>
                                    {icon(icons::CHEVRON_LEFT, "h-4 w-4")}
                                </button>
                            }.into_view()
                        } else {
                            view! {
                                <div class="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style="background: var(--avatar-ai-bg)">
                                    {icon(icons::MESSAGE_CIRCLE, "h-3.5 w-3.5 text-white")}
                                </div>
                            }.into_view()
                        }}
                        <span class="font-bold text-sm tracking-tight" style="color: var(--text-color)">
                            {move || match app.view.get() {
                                View::Settings => app.tr().settings,
                                View::Widgets => app.tr().widgets,
                                View::Chat => app.tr().chat,
                            }}
                        </span>
                    </div>

                    <Show when=move || app.view.get() == View::Chat>
                        <div class="flex items-center gap-1">
                            <Show when=move || app.auto_answer_enabled.get()>
                                <button
                                    class=move || classes(&["h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-primary", if app.is_auto_answering.get() { "animate-pulse text-primary" } else { "" }])
                                    title="Auto-answer current question"
                                    disabled=move || chat.is_typing.get() || app.is_auto_answering.get()
                                    on:click=move |_| spawn_local(auto_answer(app, chat))
                                >
                                    {icon(icons::WAND2, "h-4 w-4")}
                                </button>
                            </Show>
                            <button class="h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground" title="Widgets" on:click=move |_| app.view.set(View::Widgets)>
                                {icon(icons::LAYOUT_GRID, "h-4 w-4")}
                            </button>
                            <button id="settings-btn" class="h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground" on:click=move |_| app.view.set(View::Settings)>
                                {icon(icons::SETTINGS, "h-4 w-4")}
                            </button>
                        </div>
                    </Show>
                </header>

                <main class="flex-1 relative overflow-hidden flex flex-col">
                    <div class=chat_class>
                        <MessageList/>
                        <InputArea/>
                    </div>
                    <div class=settings_class>
                        <SettingsView on_close=on_settings_close/>
                    </div>
                    <div class=widgets_class>
                        <WidgetsView/>
                    </div>
                </main>
            </div>
        </Show>
    }
}
