//! Study widgets: Timer, Notes, Calculator. Mirrors
//! `components/Widgets/WidgetsView.tsx`.

use gloo_timers::callback::{Interval, Timeout};
use leptos::*;

use aipage_core::storage;

use crate::icons::{self, icon};
use crate::util::{classes, evaluate};

fn now() -> f64 {
    js_sys::Date::now()
}

#[component]
pub fn WidgetsView() -> impl IntoView {
    view! {
        <div class="flex flex-col h-full overflow-y-auto px-4 py-6 space-y-4" style="background: var(--bg-color)">
            <header class="flex flex-col gap-1">
                <h2 class="text-2xl font-bold tracking-tight text-foreground">"Widgets"</h2>
                <p class="text-sm text-muted-foreground">"Handy tools for studying."</p>
            </header>
            <WidgetCard title="Timer" icon_svg=icons::TIMER default_open=true>
                <TimerCard/>
            </WidgetCard>
            <WidgetCard title="Notes" icon_svg=icons::NOTEBOOK_PEN default_open=true>
                <NotesCard/>
            </WidgetCard>
            <WidgetCard title="Calculator" icon_svg=icons::CALCULATOR default_open=false>
                <CalculatorCard/>
            </WidgetCard>
        </div>
    }
}

#[component]
fn WidgetCard(
    title: &'static str,
    icon_svg: &'static str,
    default_open: bool,
    children: ChildrenFn,
) -> impl IntoView {
    let open = create_rw_signal(default_open);
    view! {
        <div class="rounded-xl border overflow-hidden" style="border-color: var(--border-color)">
            <div
                class="py-3 px-4 bg-muted/20 cursor-pointer hover:bg-muted/40 transition-colors"
                on:click=move |_| open.update(|o| *o = !*o)
            >
                <div class="text-sm font-semibold flex items-center justify-between">
                    <div class="flex items-center gap-2">
                        {icon(icon_svg, "h-4 w-4 text-primary")}
                        {title}
                    </div>
                    {move || if open.get() {
                        icon(icons::CHEVRON_UP, "h-3.5 w-3.5 text-muted-foreground").into_view()
                    } else {
                        icon(icons::CHEVRON_DOWN, "h-3.5 w-3.5 text-muted-foreground").into_view()
                    }}
                </div>
            </div>
            <Show when=move || open.get()>
                <div class="p-4">{children()}</div>
            </Show>
        </div>
    }
}

#[component]
fn TimerCard() -> impl IntoView {
    let countdown = create_rw_signal(false);
    let running = create_rw_signal(false);
    let elapsed = create_rw_signal(0.0_f64);
    let minutes = create_rw_signal("5".to_string());
    let total = create_rw_signal(5.0 * 60.0 * 1000.0);

    let interval = store_value::<Option<Interval>>(None);
    let start_time = store_value(0.0_f64);
    let base = store_value(0.0_f64);

    let stop = move || {
        interval.set_value(None); // dropping the Interval cancels it
        running.set(false);
    };

    let start = move || {
        start_time.set_value(now());
        running.set(true);
        let iv = Interval::new(100, move || {
            let next = base.get_value() + (now() - start_time.get_value());
            elapsed.set(next);
            if countdown.get_untracked() && next >= total.get_untracked() {
                interval.set_value(None);
                running.set(false);
                elapsed.set(total.get_untracked());
            }
        });
        interval.set_value(Some(iv));
    };

    let reset = move || {
        stop();
        base.set_value(0.0);
        elapsed.set(0.0);
    };

    let toggle = move |_| {
        if running.get() {
            base.set_value(elapsed.get());
            stop();
        } else {
            start();
        }
    };

    let set_countdown = move |_| {
        let mins: f64 = minutes.get_untracked().parse().unwrap_or(5.0);
        total.set((mins * 60.0 * 1000.0).round());
        stop();
        base.set_value(0.0);
        elapsed.set(0.0);
    };

    let display = move || {
        let ms = if countdown.get() { (total.get() - elapsed.get()).max(0.0) } else { elapsed.get() };
        let total_sec = (ms / 1000.0).floor() as i64;
        let done = countdown.get() && ms == 0.0;
        (format!("{:02}:{:02}", total_sec / 60, total_sec % 60), done)
    };

    let tab_class = move |is_active: bool| {
        classes(&[
            "px-2 py-1 rounded-md transition-colors",
            if is_active { "bg-primary text-primary-foreground" } else { "text-muted-foreground hover:text-foreground" },
        ])
    };

    view! {
        <div class="space-y-3">
            <div class="flex gap-2 text-xs">
                <button class=move || tab_class(!countdown.get()) on:click=move |_| { countdown.set(false); reset(); }>"Stopwatch"</button>
                <button class=move || tab_class(countdown.get()) on:click=move |_| { countdown.set(true); reset(); }>"Countdown"</button>
            </div>

            <Show when=move || countdown.get()>
                <div class="flex gap-2 items-center">
                    <input
                        type="number"
                        prop:value=move || minutes.get()
                        on:input=move |ev| minutes.set(event_target_value(&ev))
                        placeholder="Minutes"
                        class="h-7 text-xs w-20 rounded-lg px-2 bg-muted/30 outline-none border"
                        style="border-color: var(--border-color)"
                        min="0.1"
                        step="0.5"
                    />
                    <span class="text-xs text-muted-foreground">"min"</span>
                    <button class="h-7 px-2 text-xs rounded-lg border" style="border-color: var(--border-color)" on:click=set_countdown>"Set"</button>
                </div>
            </Show>

            <div class=move || classes(&[
                "text-4xl font-mono font-bold text-center py-2 tracking-widest transition-colors",
                if display().1 { "text-destructive animate-pulse" } else { "text-foreground" },
            ])>
                {move || display().0}
            </div>

            <div class="flex gap-2 justify-center">
                <button class="h-8 px-4 rounded-lg text-white inline-flex items-center" style="background: var(--message-user-bg)" on:click=toggle>
                    {move || if running.get() {
                        view! { {icon(icons::PAUSE, "h-3 w-3 mr-1")} "Pause" }.into_view()
                    } else {
                        view! { {icon(icons::PLAY, "h-3 w-3 mr-1")} "Start" }.into_view()
                    }}
                </button>
                <button class="h-8 px-3 rounded-lg border" style="border-color: var(--border-color)" on:click=move |_| reset()>
                    {icon(icons::ROTATE_CCW, "h-3 w-3")}
                </button>
            </div>
        </div>
    }
}

#[component]
fn NotesCard() -> impl IntoView {
    let notes = create_rw_signal(String::new());
    let saved = create_rw_signal(false);
    let debounce = store_value::<Option<Timeout>>(None);

    spawn_local(async move {
        notes.set(storage::get_widget_notes().await);
    });

    let on_input = move |ev: web_sys::Event| {
        let val = event_target_value(&ev);
        notes.set(val.clone());
        saved.set(false);
        let t = Timeout::new(500, move || {
            let val = val.clone();
            spawn_local(async move {
                storage::save_widget_notes(&val).await;
                saved.set(true);
                let clear = Timeout::new(1500, move || saved.set(false));
                clear.forget();
            });
        });
        debounce.set_value(Some(t));
    };

    view! {
        <div class="space-y-2">
            <textarea
                prop:value=move || notes.get()
                on:input=on_input
                placeholder="Quick notes..."
                class="w-full h-28 bg-muted/20 border rounded-lg px-3 py-2 text-xs resize-none outline-none"
                style="border-color: var(--border-color)"
            ></textarea>
            <p class=move || classes(&[
                "text-[10px] text-right transition-opacity duration-500",
                if saved.get() { "text-primary opacity-100" } else { "opacity-0" },
            ])>"Saved"</p>
        </div>
    }
}

#[component]
fn CalculatorCard() -> impl IntoView {
    let expr = create_rw_signal(String::new());
    let result = create_rw_signal::<Option<String>>(None);
    let error = create_rw_signal(false);
    let history = create_rw_signal::<Vec<String>>(Vec::new());

    let evaluate_expr = move || {
        let e = expr.get_untracked();
        if e.trim().is_empty() {
            return;
        }
        match evaluate(&e) {
            Ok(res) => {
                result.set(Some(res.clone()));
                error.set(false);
                history.update(|h| {
                    h.insert(0, format!("{e} = {res}"));
                    h.truncate(5);
                });
            }
            Err(_) => {
                result.set(Some("Error".to_string()));
                error.set(true);
            }
        }
    };

    view! {
        <div class="space-y-2">
            <div class="flex gap-2">
                <input
                    prop:value=move || expr.get()
                    on:input=move |ev| { expr.set(event_target_value(&ev)); result.set(None); error.set(false); }
                    on:keydown=move |ev| if ev.key() == "Enter" { ev.prevent_default(); evaluate_expr(); }
                    placeholder="2 + 2 * 3"
                    class="h-8 text-xs rounded-lg px-2 bg-muted/30 font-mono flex-1 outline-none border"
                    style="border-color: var(--border-color)"
                />
                <button class="h-8 px-3 shrink-0 rounded-lg text-white" style="background: var(--message-user-bg)" on:click=move |_| evaluate_expr()>"="</button>
            </div>
            <Show when=move || result.get().is_some()>
                <div class=move || classes(&[
                    "text-center text-lg font-mono font-bold py-1",
                    if error.get() { "text-destructive" } else { "text-primary" },
                ])>
                    {move || result.get().unwrap_or_default()}
                </div>
            </Show>
            <div class="space-y-0.5">
                {move || history.get().into_iter().map(|h| {
                    let expr_part = h.split(" = ").next().unwrap_or("").to_string();
                    view! {
                        <p
                            class="text-[10px] text-muted-foreground font-mono cursor-pointer hover:text-foreground truncate"
                            on:click=move |_| { expr.set(expr_part.clone()); result.set(None); }
                        >{h}</p>
                    }
                }).collect_view()}
            </div>
        </div>
    }
}
