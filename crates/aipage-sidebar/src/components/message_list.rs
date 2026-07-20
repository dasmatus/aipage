//! Chat message list with markdown rendering, avatars and action buttons.
//! Mirrors `components/Chat/MessageList.tsx`.

use leptos::*;
use leptos::html::Div;

use aipage_core::markdown;
use aipage_core::types::{Message, Role};

use crate::icons::{self, icon};
use crate::state::{handle_action_click, AppState, ChatState};
use crate::util::classes;

#[component]
pub fn MessageList() -> impl IntoView {
    let app = use_context::<AppState>().unwrap();
    let chat = use_context::<ChatState>().unwrap();

    let bottom_ref = create_node_ref::<Div>();
    // Auto-scroll to the newest message.
    create_effect(move |_| {
        chat.messages.get();
        if let Some(el) = bottom_ref.get() {
            el.scroll_into_view();
        }
    });

    view! {
        <div class="flex-1 overflow-y-auto px-3 py-4 space-y-3 scroll-smooth" id="chat-history">
            {move || {
                let disable = chat.is_typing.get();
                let initials = app.user_initials.get();
                chat.messages
                    .get()
                    .into_iter()
                    .map(|msg| message_row(msg, initials.clone(), disable, app, chat))
                    .collect_view()
            }}
            <div node_ref=bottom_ref class="h-3"></div>
        </div>
    }
}

fn message_row(msg: Message, initials: String, disable: bool, app: AppState, chat: ChatState) -> impl IntoView {
    let is_user = msg.role == Role::User;
    let row_class = classes(&[
        "flex gap-2.5 max-w-[92%] animate-in fade-in slide-in-from-bottom-2 duration-200",
        if is_user { "ml-auto flex-row-reverse" } else { "mr-auto" },
    ]);
    let avatar_bg = if is_user { "var(--avatar-user-bg)" } else { "var(--avatar-ai-bg)" };
    let bubble_class = classes(&[
        "px-3.5 py-2.5 shadow-sm border text-sm leading-relaxed",
        if is_user { "rounded-[16px_16px_4px_16px] text-white" } else { "rounded-[16px_16px_16px_4px]" },
    ]);
    let bubble_style = if is_user {
        "background: var(--message-user-bg); border-color: var(--border-color);".to_string()
    } else {
        "background: var(--message-ai-bg); border-color: var(--border-color); backdrop-filter: var(--backdrop-blur); color: var(--text-color);".to_string()
    };
    let html = markdown::render(&msg.content);

    let avatar = if is_user {
        if initials.is_empty() {
            icon(icons::USER, "w-3.5 h-3.5 text-white").into_view()
        } else {
            view! { <span class="text-[10px] font-bold text-white">{initials}</span> }.into_view()
        }
    } else {
        icon(icons::BOT, "w-3.5 h-3.5 text-white").into_view()
    };

    let image = msg.image_url.clone().map(|url| {
        view! {
            <a href=url.clone() target="_blank" rel="noopener noreferrer" class="block mt-2">
                <img
                    src=url
                    alt=msg.content.clone()
                    class="rounded-xl max-w-full max-h-64 object-contain border border-border/30 hover:opacity-90 transition-opacity"
                />
            </a>
        }
    });

    let actions = msg.actions.clone().map(|acts| {
        let buttons = acts
            .into_iter()
            .map(|act| {
                let label = act.label.clone();
                let action = act.action.clone();
                let primary = act.primary;
                let btn_class = classes(&[
                    "h-7 text-[11px] font-semibold py-1 px-3 rounded-full cursor-pointer inline-flex items-center border disabled:opacity-50",
                    if primary { "shadow-md text-white" } else { "" },
                ]);
                let btn_style = if primary {
                    "background: var(--message-user-bg); color: white; border-color: transparent;"
                } else {
                    "border-color: var(--border-color);"
                };
                let spark = primary.then(|| icon(icons::SPARKLES, "w-3 h-3 mr-1"));
                view! {
                    <button
                        class=btn_class
                        style=btn_style
                        disabled=disable
                        on:click=move |_| {
                            let action = action.clone();
                            spawn_local(handle_action_click(app, chat, action));
                        }
                    >
                        {spark}
                        {label}
                    </button>
                }
            })
            .collect_view();
        view! { <div class="flex flex-wrap gap-1.5 mt-0.5 px-1">{buttons}</div> }
    });

    view! {
        <div class=row_class>
            <div
                class="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
                style=format!("background: {avatar_bg}")
            >
                {avatar}
            </div>
            <div class="flex flex-col gap-1.5 min-w-0">
                <div class=bubble_class style=bubble_style>
                    <div class="prose prose-sm max-w-none break-words text-[13px] leading-relaxed" inner_html=html></div>
                    {image}
                </div>
                {actions}
            </div>
        </div>
    }
}
