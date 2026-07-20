//! Chat input with scan / search / image-mode toolbar. Mirrors
//! `components/Chat/InputArea.tsx`.

use gloo_timers::callback::Timeout;
use leptos::*;
use leptos::html::{Input, Textarea};

use crate::icons::{self, icon};
use crate::state::{generate_image, handle_send, scan_page, search_web, AppState, ChatState};

#[component]
pub fn InputArea() -> impl IntoView {
    let app = use_context::<AppState>().unwrap();
    let chat = use_context::<ChatState>().unwrap();

    let text = create_rw_signal(String::new());
    let search_mode = create_rw_signal(false);
    let image_mode = create_rw_signal(false);
    let search_query = create_rw_signal(String::new());
    let textarea_ref = create_node_ref::<Textarea>();
    let search_input_ref = create_node_ref::<Input>();

    let disabled = move || chat.is_typing.get();

    let auto_resize = move || {
        if let Some(ta) = textarea_ref.get() {
            let el: &web_sys::HtmlTextAreaElement = &ta;
            let _ = el.style().set_property("height", "auto");
            let _ = el.style().set_property("height", &format!("{}px", el.scroll_height()));
        }
    };

    let do_send = move || {
        let t = text.get_untracked();
        if t.trim().is_empty() || disabled() {
            return;
        }
        let t = t.trim().to_string();
        if image_mode.get_untracked() {
            spawn_local(generate_image(app, chat, t));
        } else {
            spawn_local(handle_send(app, chat, t));
        }
        text.set(String::new());
        if let Some(ta) = textarea_ref.get() {
            let el: &web_sys::HtmlTextAreaElement = &ta;
            let _ = el.style().set_property("height", "auto");
        }
    };

    let do_search = move || {
        let q = search_query.get_untracked();
        if !q.trim().is_empty() {
            spawn_local(search_web(app, chat, q.trim().to_string()));
            search_query.set(String::new());
            search_mode.set(false);
        }
    };

    let toggle_search = move |_| {
        let next = !search_mode.get();
        search_mode.set(next);
        if next {
            image_mode.set(false);
            // Focus the search input once it mounts (mirrors the TS setTimeout focus).
            Timeout::new(100, move || {
                if let Some(el) = search_input_ref.get() {
                    let input: &web_sys::HtmlInputElement = &el;
                    let _ = input.focus();
                }
            })
            .forget();
        } else {
            search_query.set(String::new());
        }
    };

    let toggle_image = move |_| {
        let next = !image_mode.get();
        image_mode.set(next);
        if next {
            search_mode.set(false);
            search_query.set(String::new());
        }
        // The TS handler always refocuses the textarea after toggling.
        Timeout::new(50, move || {
            if let Some(el) = textarea_ref.get() {
                let ta: &web_sys::HtmlTextAreaElement = &el;
                let _ = ta.focus();
            }
        })
        .forget();
    };

    view! {
        <div
            class="px-3 py-2.5 border-t space-y-2.5 backdrop-blur-md"
            style="background: var(--header-bg); border-color: var(--border-color);"
        >
            // Toolbar
            <div class="flex items-center gap-1">
                <button
                    class="h-7 w-7 rounded-lg flex items-center justify-center transition-colors cursor-pointer"
                    style="color: var(--secondary-text)"
                    title=move || app.tr().analyze_page
                    disabled=move || app.is_scanning.get() || disabled()
                    on:click=move |_| spawn_local(scan_page(app, chat))
                >
                    {move || if app.is_scanning.get() {
                        icon(icons::LOADER2, "h-3.5 w-3.5 animate-spin").into_view()
                    } else {
                        icon(icons::FILE_TEXT, "h-3.5 w-3.5").into_view()
                    }}
                </button>

                <button
                    class="h-7 w-7 rounded-lg flex items-center justify-center transition-colors cursor-pointer"
                    style=move || if search_mode.get() {
                        "color: var(--accent-color); background: color-mix(in srgb, var(--accent-color) 12%, transparent);".to_string()
                    } else {
                        "color: var(--secondary-text); background: transparent;".to_string()
                    }
                    title=move || if search_mode.get() { app.tr().close_search } else { app.tr().search_web }
                    disabled=disabled
                    on:click=toggle_search
                >
                    {move || if search_mode.get() {
                        icon(icons::X, "h-3.5 w-3.5").into_view()
                    } else {
                        icon(icons::SEARCH, "h-3.5 w-3.5").into_view()
                    }}
                </button>

                <Show when=move || app.image_gen_enabled.get()>
                    <button
                        class="h-7 w-7 rounded-lg flex items-center justify-center transition-colors cursor-pointer"
                        style=move || if image_mode.get() {
                            "color: var(--accent-color); background: color-mix(in srgb, var(--accent-color) 12%, transparent);".to_string()
                        } else {
                            "color: var(--secondary-text); background: transparent;".to_string()
                        }
                        title=move || app.tr().image_gen
                        disabled=disabled
                        on:click=toggle_image
                    >
                        {icon(icons::IMAGE, "h-3.5 w-3.5")}
                    </button>
                </Show>

                <Show when=move || search_mode.get()>
                    <div class="flex-1 flex gap-1.5">
                        <input
                            id="search-input"
                            node_ref=search_input_ref
                            placeholder=move || app.tr().search_placeholder
                            prop:value=move || search_query.get()
                            on:input=move |ev| search_query.set(event_target_value(&ev))
                            on:keydown=move |ev| {
                                if ev.key() == "Enter" { ev.prevent_default(); do_search(); }
                                else if ev.key() == "Escape" { search_mode.set(false); search_query.set(String::new()); }
                            }
                            disabled=disabled
                            class="flex-1 h-7 text-xs rounded-lg px-2.5 outline-none"
                            style="background: var(--input-bg); border: 1px solid var(--border-color); color: var(--text-color);"
                        />
                        <button
                            class="h-7 px-2.5 text-[11px] font-bold rounded-lg text-white cursor-pointer disabled:opacity-50"
                            style="background: var(--message-user-bg)"
                            disabled=move || search_query.get().trim().is_empty() || disabled()
                            on:click=move |_| do_search()
                        >
                            {move || app.tr().search}
                        </button>
                    </div>
                </Show>
            </div>

            // Input row
            <div class="flex items-end gap-2">
                <textarea
                    id="chat-input"
                    node_ref=textarea_ref
                    placeholder=move || if image_mode.get() { app.tr().image_gen_prompt_placeholder } else { app.tr().ask_anything }
                    rows="1"
                    prop:value=move || text.get()
                    on:input=move |ev| { text.set(event_target_value(&ev)); auto_resize(); }
                    on:keydown=move |ev: web_sys::KeyboardEvent| {
                        if ev.key() == "Enter" && !ev.shift_key() { ev.prevent_default(); do_send(); }
                    }
                    disabled=disabled
                    class="flex-1 min-h-[38px] max-h-[150px] rounded-xl px-3.5 py-2.5 text-[13px] resize-none outline-none transition-all duration-200"
                    style="background: var(--input-bg); border: 1px solid var(--border-color); color: var(--text-color); backdrop-filter: var(--backdrop-blur);"
                ></textarea>
                <button
                    id="send-btn"
                    class="h-[38px] w-[38px] rounded-xl shrink-0 flex items-center justify-center text-white transition-all duration-150 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                    style=move || if text.get().trim().is_empty() {
                        "background: var(--border-color); transform: scale(0.95);".to_string()
                    } else {
                        "background: var(--message-user-bg); transform: scale(1); box-shadow: 0 4px 14px color-mix(in srgb, var(--accent-color) 28%, transparent);".to_string()
                    }
                    title=move || app.tr().send
                    disabled=move || text.get().trim().is_empty() || disabled()
                    on:click=move |_| do_send()
                >
                    {move || if image_mode.get() {
                        icon(icons::IMAGE, "h-4 w-4").into_view()
                    } else {
                        icon(icons::SEND, "h-4 w-4").into_view()
                    }}
                </button>
            </div>
        </div>
    }
}
