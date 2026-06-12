# Glassmorphism Sidebar Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the EduPage AI sidebar extension with glassmorphism — frosted semi-transparent panels, Inter font, gradient accents, and updated CSS variables for all 6 themes.

**Architecture:** `sidebar.scss` is the source of truth for all CSS custom properties; the Tailwind config consumes those vars, so most visual changes happen in SCSS. React components are updated to use inline `style={{ background: 'var(--xxx)' }}` where gradients are required (since `background-color` in Tailwind can't accept `linear-gradient` values). No logic, storage, or i18n changes.

**Tech Stack:** React · Tailwind CSS (v3) · shadcn/ui · SCSS · Lucide icons · Bun bundler

---

## File Map

| File | Change |
|---|---|
| `src/sidebar/sidebar.html` | Add Inter Google Fonts `<link>` |
| `src/sidebar/sidebar.scss` | Rewrite all CSS custom properties for all 6 themes; add `--backdrop-blur`, `--avatar-ai-bg`, `--avatar-user-bg`; fix `body` to use `background` shorthand |
| `src/sidebar/tailwind.css` | Update `--radius` and destructive colour tokens |
| `src/sidebar/App.tsx` | Root div: inline background; header: glass style, logo icon tile |
| `src/sidebar/components/Chat/MessageList.tsx` | Bubble inline styles (gradients), avatar inline styles, action chip classes |
| `src/sidebar/components/Chat/InputArea.tsx` | Glass container inline style, send button inline style, toolbar button sizing |
| `src/sidebar/components/Settings/SettingsView.tsx` | Glass cards, coloured icon tiles per section, save button gradient |
| `src/sidebar/components/Widgets/WidgetsView.tsx` | Container inline background |

---

## Task 1 — Feature branch

**Files:** none

- [ ] **Create the branch**

```bash
git checkout -b feat/glassmorphism-redesign
```

---

## Task 2 — Inter font

**Files:**
- Modify: `src/sidebar/sidebar.html`

- [ ] **Add the Google Fonts link**

Replace:
```html
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>AIPage</title>
    <link rel="stylesheet" href="sidebar.css" />
    <link rel="stylesheet" href="tailwind.css" />
  </head>
```
With:
```html
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>AIPage</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400..700&display=swap" rel="stylesheet" />
    <link rel="stylesheet" href="sidebar.css" />
    <link rel="stylesheet" href="tailwind.css" />
  </head>
```

- [ ] **Commit**

```bash
git add src/sidebar/sidebar.html
git commit -m "feat: add Inter font via Google Fonts"
```

---

## Task 3 — sidebar.scss: glassmorphism variables

**Files:**
- Modify: `src/sidebar/sidebar.scss`

This is the largest change. All six themes get glassmorphism-compatible tokens. `background-color` on `body` is replaced with `background` so it can accept `linear-gradient` values.

- [ ] **Replace the entire file with the following**

```scss
@use "sass:color";

$font-family: 'Inter', Arial, Helvetica, sans-serif;
$header-height: 48px;

/* ── DEFAULT THEME: EduPage ───────────────────────────── */
:root {
    --bg-color: linear-gradient(160deg, #dbeafe 0%, #ecfdf5 50%, #e0f2fe 100%);
    --card-bg: rgba(255, 255, 255, 0.72);
    --backdrop-blur: blur(12px);
    --text-color: #0c4a6e;
    --heading-color: #0c4a6e;
    --secondary-text: #64748b;
    --border-color: rgba(44, 112, 163, 0.15);
    --accent-color: #2c70a3;
    --accent-text: #ffffff;
    --header-bg: rgba(255, 255, 255, 0.70);
    --header-text: #0c4a6e;
    --input-bg: rgba(255, 255, 255, 0.60);
    --message-user-bg: linear-gradient(135deg, #2c70a3, #3b82f6);
    --message-ai-bg: rgba(255, 255, 255, 0.75);
    --avatar-ai-bg: linear-gradient(135deg, #2e7d32, #4ade80);
    --avatar-user-bg: linear-gradient(135deg, #2c70a3, #3b82f6);
    --font-family: #{$font-family};
    --header-height: #{$header-height};
    --bubble-radius: 16px;

    /* Contrast / misc */
    --instruction-bg: rgba(255, 255, 255, 0.65);
    --instruction-text: #0c4a6e;
    --instruction-border: rgba(44, 112, 163, 0.15);
    --avatar-bg: rgba(44, 112, 163, 0.15);
    --avatar-text: #2c70a3;
    --code-bg: rgba(44, 112, 163, 0.07);
    --pre-bg: rgba(255, 255, 255, 0.60);
    --scrollbar-thumb: rgba(44, 112, 163, 0.25);
}

/* ── iMessage ─────────────────────────────────────────── */
body[data-theme="sms"] {
    --bg-color: linear-gradient(160deg, #f8fafc 0%, #ffffff 100%);
    --card-bg: rgba(255, 255, 255, 0.80);
    --header-bg: rgba(255, 255, 255, 0.80);
    --accent-color: #007aff;
    --border-color: rgba(0, 122, 255, 0.12);
    --message-user-bg: #007aff;
    --message-ai-bg: rgba(233, 233, 235, 0.90);
    --avatar-ai-bg: #e9e9eb;
    --avatar-user-bg: #007aff;
    --avatar-text: #007aff;
    --text-color: #000000;
    --heading-color: #000000;
    --accent-text: #ffffff;
    --bubble-radius: 20px;
    --code-bg: rgba(0, 0, 0, 0.05);
    --pre-bg: rgba(233, 233, 235, 0.70);
    --scrollbar-thumb: rgba(0, 0, 0, 0.15);
}

/* ── Gradient / Messenger ─────────────────────────────── */
body[data-theme="gradient"] {
    --bg-color: #000000;
    --card-bg: rgba(255, 255, 255, 0.06);
    --backdrop-blur: blur(16px);
    --header-bg: rgba(0, 0, 0, 0.70);
    --border-color: rgba(255, 255, 255, 0.08);
    --accent-color: #f81ce5;
    --accent-text: #ffffff;
    --text-color: #f1f5f9;
    --heading-color: #ffffff;
    --secondary-text: #94a3b8;
    --message-user-bg: linear-gradient(135deg, #7928ca, #ff0080);
    --message-ai-bg: rgba(255, 255, 255, 0.07);
    --avatar-ai-bg: linear-gradient(135deg, #7928ca, #ff0080);
    --avatar-user-bg: linear-gradient(135deg, #f81ce5, #ff0080);
    --input-bg: rgba(255, 255, 255, 0.06);
    --instruction-bg: rgba(255, 255, 255, 0.05);
    --instruction-text: #cbd5e1;
    --avatar-bg: rgba(255, 255, 255, 0.10);
    --avatar-text: #e2e8f0;
    --code-bg: rgba(255, 255, 255, 0.08);
    --pre-bg: rgba(255, 255, 255, 0.05);
    --scrollbar-thumb: rgba(255, 255, 255, 0.15);
}

/* ── Discord ──────────────────────────────────────────── */
body[data-theme="discord"] {
    --bg-color: #313338;
    --card-bg: rgba(47, 49, 54, 0.85);
    --backdrop-blur: blur(12px);
    --header-bg: rgba(47, 49, 54, 0.90);
    --border-color: rgba(255, 255, 255, 0.05);
    --accent-color: #5865f2;
    --accent-text: #ffffff;
    --text-color: #dbdee1;
    --heading-color: #ffffff;
    --secondary-text: #949ba4;
    --message-user-bg: transparent;
    --message-ai-bg: transparent;
    --avatar-ai-bg: #5865f2;
    --avatar-user-bg: #5865f2;
    --input-bg: rgba(56, 58, 64, 0.90);
    --instruction-bg: rgba(43, 45, 49, 0.85);
    --instruction-text: #dbdee1;
    --avatar-bg: #5865f2;
    --avatar-text: #ffffff;
    --code-bg: rgba(0, 0, 0, 0.30);
    --pre-bg: rgba(30, 31, 34, 0.90);
    --scrollbar-thumb: rgba(0, 0, 0, 0.30);
    --bubble-radius: 0px;

    .message {
        margin-bottom: 2px;
        max-width: 100%;
        padding: 4px 16px;

        &:hover { background-color: rgba(46, 48, 53, 0.70); }

        &.user {
            flex-direction: row;
            align-self: flex-start;

            .content {
                color: var(--text-color);
                padding: 0;
            }

            .avatar { background: #5865f2; }
        }

        .content {
            background: transparent;
            border: none;
            box-shadow: none;
            padding: 0;
            margin-top: 2px;
            color: var(--text-color);
        }

        .avatar { margin-top: 4px; }
    }

    .chat-history {
        padding: 16px 0;
        gap: 0;
    }
}

/* ── Tokyo Night ──────────────────────────────────────── */
body[data-theme="tokyo"] {
    --bg-color: #1a1b26;
    --card-bg: rgba(36, 40, 59, 0.88);
    --backdrop-blur: blur(12px);
    --header-bg: rgba(36, 40, 59, 0.90);
    --border-color: rgba(122, 162, 247, 0.12);
    --accent-color: #7aa2f7;
    --accent-text: #ffffff;
    --text-color: #c0caf5;
    --heading-color: #7aa2f7;
    --secondary-text: #565f89;
    --message-user-bg: linear-gradient(135deg, #3b4261, #414868);
    --message-ai-bg: rgba(36, 40, 59, 0.90);
    --avatar-ai-bg: linear-gradient(135deg, #7aa2f7, #bb9af7);
    --avatar-user-bg: #3b4261;
    --input-bg: rgba(26, 27, 38, 0.80);
    --instruction-bg: rgba(31, 35, 53, 0.85);
    --instruction-text: #9aa5ce;
    --avatar-bg: #1a1b26;
    --avatar-text: #565f89;
    --code-bg: rgba(0, 0, 0, 0.30);
    --pre-bg: rgba(22, 22, 30, 0.90);
    --scrollbar-thumb: rgba(65, 72, 104, 0.60);
}

/* ── Mono ─────────────────────────────────────────────── */
body[data-theme="mono"] {
    --bg-color: #ffffff;
    --card-bg: rgba(255, 255, 255, 0.90);
    --backdrop-blur: blur(0px);
    --header-bg: rgba(255, 255, 255, 0.95);
    --border-color: #000000;
    --accent-color: #000000;
    --accent-text: #ffffff;
    --text-color: #000000;
    --heading-color: #000000;
    --message-user-bg: #000000;
    --message-ai-bg: #ffffff;
    --avatar-ai-bg: #000000;
    --avatar-user-bg: #000000;
    --input-bg: #ffffff;
    --bubble-radius: 0px;
    --instruction-border: 1px solid #000000;
    --code-bg: rgba(0, 0, 0, 0.06);
    --pre-bg: #f5f5f5;
    --scrollbar-thumb: #999999;
}

/* ── Base styles ──────────────────────────────────────── */
body {
    margin: 0;
    padding: 0;
    /* Use 'background' not 'background-color' so gradient values work */
    background: var(--bg-color);
    color: var(--text-color);
    font-family: var(--font-family);
    display: flex;
    flex-direction: column;
    height: 100vh;
    font-size: 14px;

    &::selection {
        background-color: var(--accent-color);
        color: var(--accent-text, #000);
    }
}

*::selection {
    background-color: var(--accent-color);
    color: var(--accent-text, #000);
}

/* ── Global utilities ─────────────────────────────────── */
.hidden { display: none !important; }

.view {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
}

/* ── Icon buttons ─────────────────────────────────────── */
.icon-btn {
    background: none;
    border: none;
    color: var(--secondary-text);
    cursor: pointer;
    padding: 6px;
    border-radius: 8px;
    transition: background 0.15s;
    display: flex;
    align-items: center;
    justify-content: center;

    &:hover {
        background: rgba(0, 0, 0, 0.05);
        color: var(--text-color);
    }
}

/* ── Chat history ─────────────────────────────────────── */
.chat-history {
    flex: 1;
    padding: 16px 12px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 12px;
}

/* ── Message bubbles (legacy SCSS path, kept for compat) ─ */
.message {
    display: flex;
    gap: 8px;
    max-width: 90%;

    &.user {
        align-self: flex-end;
        flex-direction: row-reverse;

        .avatar { background: var(--avatar-user-bg); color: white; }
        .content {
            background: var(--message-user-bg);
            border-color: transparent;
            color: var(--accent-text);

            p, li, ul, ol { color: var(--text-color) !important; }
        }
    }

    &.ai {
        .avatar { background: var(--avatar-ai-bg); color: white; }
    }
}

.avatar {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: var(--avatar-bg);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 10px;
    font-weight: 700;
    color: var(--avatar-text);
    flex-shrink: 0;
}

.content {
    background: var(--card-bg);
    backdrop-filter: var(--backdrop-blur);
    padding: 9px 13px;
    border-radius: var(--bubble-radius);
    font-size: 13px;
    line-height: 1.55;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
    border: 1px solid var(--border-color);
    overflow-wrap: break-word;

    p {
        margin: 0 0 8px 0;
        &:last-child { margin-bottom: 0; }
    }

    ul, ol { margin: 8px 0; padding-left: 20px; }
    li { margin-bottom: 4px; }

    code {
        background: var(--code-bg);
        padding: 2px 4px;
        border-radius: 4px;
        font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
        font-size: 0.9em;
    }

    pre {
        background: var(--pre-bg);
        border: 1px solid var(--border-color);
        border-radius: 8px;
        padding: 12px;
        overflow-x: auto;
        margin: 10px 0;

        code {
            background: none;
            padding: 0;
            font-size: 12px;
            display: block;
        }
    }
}

/* ── Input area ───────────────────────────────────────── */
.chat-input-area {
    padding: 10px 12px;
    border-top: 1px solid var(--border-color);
    display: flex;
    gap: 8px;
    background: var(--header-bg);
    backdrop-filter: var(--backdrop-blur);
    align-items: flex-end;
}

#chat-input {
    flex: 1;
    resize: none;
    min-height: 38px;
    max-height: 150px;
    padding: 9px 12px;
    box-sizing: border-box;
    line-height: 1.55;
    background: var(--input-bg);
    border: 1px solid var(--border-color);
    border-radius: 12px;
    backdrop-filter: var(--backdrop-blur);
    color: var(--text-color);
    font-family: var(--font-family);
    font-size: 13px;
    outline: none;

    &:focus {
        border-color: var(--accent-color);
        box-shadow: 0 0 0 3px rgba(44, 112, 163, 0.12);
    }
}

#send-btn {
    background: var(--message-user-bg);
    color: white;
    border: none;
    width: 38px;
    height: 38px;
    border-radius: 11px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: opacity 0.15s, transform 0.15s;
    flex-shrink: 0;

    &:hover { opacity: 0.88; }
    &:disabled { background: #e0e0e0; color: #aaa; cursor: not-allowed; transform: scale(0.95); }
}

/* ── Settings ─────────────────────────────────────────── */
#settings-view {
    padding: 20px 16px;
    gap: 16px;
    background: var(--bg-color);
    overflow-y: auto;

    .settings-content {
        max-width: 500px;
        margin: 0 auto;

        h2 {
            margin: 0 0 6px 0;
            font-size: 20px;
            font-weight: 700;
            color: var(--heading-color);
        }

        .settings-description {
            margin: 0 0 20px 0;
            color: var(--secondary-text);
            font-size: 13px;
            line-height: 1.5;
        }
    }
}

.instructions-box {
    background: var(--instruction-bg);
    backdrop-filter: var(--backdrop-blur);
    border: 1px solid var(--instruction-border, var(--border-color));
    border-radius: 12px;
    padding: 14px;
    margin-bottom: 16px;

    h3 {
        margin: 0 0 10px 0;
        font-size: 13px;
        font-weight: 700;
        color: var(--text-color);
    }

    ol {
        margin: 0 0 10px 0;
        padding-left: 18px;
        color: var(--instruction-text);
        font-size: 12px;
        line-height: 1.5;
    }
}

.input-group {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-bottom: 8px;

    label {
        font-size: 10px;
        color: var(--secondary-text);
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.8px;
    }

    .hint {
        margin: 0;
        font-size: 11px;
        color: var(--secondary-text);
    }
}

.checkbox-group {
    flex-direction: row;
    align-items: center;
    gap: 12px;

    input[type="checkbox"] {
        width: 16px;
        height: 16px;
        margin: 0;
        cursor: pointer;
    }

    .inline-label {
        margin: 0;
        font-size: 12px;
        color: var(--text-color);
        text-transform: none;
        letter-spacing: normal;
        cursor: pointer;
    }
}

.note {
    margin: 6px 0 0 0;
    font-size: 11px;
    color: var(--secondary-text);
}

input[type="text"],
input[type="password"],
textarea,
select {
    background: var(--input-bg);
    backdrop-filter: var(--backdrop-blur);
    border: 1px solid var(--border-color);
    color: var(--text-color);
    padding: 9px 12px;
    border-radius: 10px;
    font-family: var(--font-family);
    font-size: 13px;
    outline: none;
    transition: border-color 0.15s, box-shadow 0.15s;

    &:focus {
        border-color: var(--accent-color);
        box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent-color) 15%, transparent);
    }
}

.primary-btn {
    background: var(--message-user-bg);
    color: var(--accent-text);
    border: none;
    padding: 12px 16px;
    border-radius: 12px;
    font-weight: 700;
    cursor: pointer;
    font-size: 13px;
    width: 100%;
    margin-top: 10px;
    transition: opacity 0.15s;

    &:hover { opacity: 0.88; }
}

.secondary-btn {
    background: transparent;
    color: var(--secondary-text);
    border: none;
    padding: 8px;
    margin-top: 10px;
    cursor: pointer;
    font-size: 12px;
    text-decoration: underline;
    width: 100%;
    text-align: center;
}

/* ── Scrollbar ────────────────────────────────────────── */
::-webkit-scrollbar {
    width: 5px;

    &-thumb {
        background: var(--scrollbar-thumb);
        border-radius: 3px;
    }
}

/* ── Animations ───────────────────────────────────────── */
@media (prefers-reduced-motion: no-preference) {
    @keyframes typingBounce {
        0%, 80%, 100% { transform: translateY(0); opacity: 0.5; }
        40%            { transform: translateY(-5px); opacity: 1; }
    }
}
```

- [ ] **Run tests to verify nothing breaks**

```bash
bun run test
```

Expected: all tests pass (SCSS changes do not affect logic tests).

- [ ] **Commit**

```bash
git add src/sidebar/sidebar.scss
git commit -m "feat: glassmorphism CSS variables for all 6 themes"
```

---

## Task 4 — tailwind.css: update radius and muted tokens

**Files:**
- Modify: `src/sidebar/tailwind.css`

`--radius` is used by shadcn components. Update it to `0.75rem` for slightly more rounded corners. Also update the foreground/muted colours to match the new EduPage palette so shadcn components that read these directly (like the Select dropdown) look right.

- [ ] **Replace the `:root` block**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: #f0f7ff;
    --foreground: #0c4a6e;
    --card: rgba(255, 255, 255, 0.72);
    --card-foreground: #0c4a6e;
    --popover: rgba(255, 255, 255, 0.90);
    --popover-foreground: #0c4a6e;
    --primary: #2c70a3;
    --primary-foreground: #ffffff;
    --secondary: #dbeafe;
    --secondary-foreground: #0c4a6e;
    --muted: #e0f2fe;
    --muted-foreground: #64748b;
    --accent: #2c70a3;
    --accent-foreground: #ffffff;
    --destructive: 0 84% 60%;
    --destructive-foreground: 210 40% 98%;
    --border: rgba(44, 112, 163, 0.15);
    --input: rgba(255, 255, 255, 0.60);
    --ring: #2c70a3;
    --radius: 0.75rem;
  }
}
```

- [ ] **Commit**

```bash
git add src/sidebar/tailwind.css
git commit -m "feat: update Tailwind CSS tokens for glassmorphism palette"
```

---

## Task 5 — App.tsx: root background + header redesign

**Files:**
- Modify: `src/sidebar/App.tsx`

Two changes:
1. Root `<div>` uses `style={{ background: 'var(--bg-color)' }}` instead of `bg-background` (because `bg-background` maps to `background-color` which cannot accept a gradient).
2. Header gets a glass logo icon tile and updated background.
3. Secondary view containers (`settings`, `widgets`) remove their explicit `bg-background` to inherit from the root.

- [ ] **Update the root div and header JSX**

In the `return` statement, replace the outer div and header:

```tsx
return (
    <div
        className="flex flex-col h-screen text-foreground overflow-hidden font-sans selection:bg-primary/30"
        style={{ background: 'var(--bg-color)' }}
    >
        {/* Header */}
        <header
            className="flex items-center justify-between px-4 border-b backdrop-blur-md z-50 shrink-0"
            style={{ height: 'var(--header-height)', background: 'var(--header-bg)', borderColor: 'var(--border-color)' }}
        >
             <div className="flex items-center gap-2">
                {isSecondaryView ? (
                    <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" onClick={() => setView('chat')}>
                        <ChevronLeft className="h-4 w-4" />
                    </Button>
                ) : (
                    <div
                        className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                        style={{ background: 'var(--avatar-ai-bg)' }}
                    >
                        <MessageCircle className="h-3.5 w-3.5 text-white" />
                    </div>
                )}
                <span className="font-bold text-sm tracking-tight" style={{ color: 'var(--text-color)' }}>
                    {view === 'settings' ? t('settings', language) : view === 'widgets' ? t('widgets', language) : t('chat', language)}
                </span>
             </div>

             {view === 'chat' && (
                 <div className="flex items-center gap-1">
                     {autoAnswerEnabled && (
                         <Button
                             variant="ghost"
                             size="icon"
                             className={cn("h-8 w-8 rounded-lg text-muted-foreground hover:text-primary", isAutoAnswering && "animate-pulse text-primary")}
                             title="Auto-answer current question"
                             onClick={handleAutoAnswer}
                             disabled={isTyping || isAutoAnswering}
                         >
                             <Wand2 className="h-4 w-4" />
                         </Button>
                     )}
                     <Button
                         variant="ghost"
                         size="icon"
                         className="h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground"
                         onClick={() => setView('widgets')}
                         title="Widgets"
                     >
                         <LayoutGrid className="h-4 w-4" />
                     </Button>
                     <Button id="settings-btn" variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground" onClick={() => setView('settings')}>
                         <Settings className="h-4 w-4" />
                     </Button>
                 </div>
             )}
        </header>

        <main className="flex-1 relative overflow-hidden flex flex-col">
            <div className={cn(
                "flex-1 flex flex-col transition-all duration-500 absolute inset-0",
                view === 'chat' ? "translate-x-0 opacity-100" : "-translate-x-full opacity-0 pointer-events-none hidden"
            )}>
                <MessageList
                    messages={messages}
                    onActionClick={handleActionClick}
                    disableActions={isTyping}
                    userInitials={userInitials}
                    language={language}
                />
                <InputArea
                    onSend={handleSend}
                    onScanPage={handleScanPage}
                    onSearchWeb={handleSearchWeb}
                    onGenerateImage={handleGenerateImage}
                    disabled={isTyping}
                    isScanning={isScanning}
                    language={language}
                    exaEnabled={exaEnabled}
                    imageGenEnabled={imageGenEnabled}
                />
            </div>

            <div className={cn(
                "flex-1 transition-all duration-500 absolute inset-0",
                view === 'settings' ? "translate-x-0 opacity-100" : "translate-x-full opacity-0 pointer-events-none hidden"
            )}>
                <SettingsView
                    currentProvider={provider}
                    onProviderChange={handleProviderChange}
                    onClose={handleSettingsClose}
                    language={language}
                    onLanguageChange={handleLanguageChange}
                />
            </div>

            <div className={cn(
                "flex-1 transition-all duration-500 absolute inset-0",
                view === 'widgets' ? "translate-x-0 opacity-100" : "translate-x-full opacity-0 pointer-events-none hidden"
            )}>
                <WidgetsView />
            </div>
        </main>
    </div>
);
```

Key changes from original:
- Root div: removed `bg-background`, added `style={{ background: 'var(--bg-color)' }}`
- Header: removed `bg-card/50`, added inline `background`/`borderColor` styles; `h-12` → height from CSS var
- Logo icon tile: gradient `style={{ background: 'var(--avatar-ai-bg)' }}` replaces the `bg-primary/10` ring
- All icon buttons: `rounded-full` → `rounded-lg` (8px)
- Secondary view containers: removed `bg-background` (inherit from root)

- [ ] **Run tests**

```bash
bun run test
```

Expected: all tests pass.

- [ ] **Commit**

```bash
git add src/sidebar/App.tsx
git commit -m "feat: glassmorphism header and root background in App"
```

---

## Task 6 — MessageList.tsx: bubbles, avatars, action chips

**Files:**
- Modify: `src/sidebar/components/Chat/MessageList.tsx`

Gradients require inline `style` because Tailwind's `bg-*` utilities set `background-color`, which rejects gradient values. All other classes stay as Tailwind.

- [ ] **Replace the `MessageList` return statement**

```tsx
return (
    <div className="flex-1 overflow-y-auto px-3 py-4 space-y-3 scroll-smooth" id="chat-history">
        {messages.map((msg) => (
            <div key={msg.id} className={cn(
                "flex gap-2.5 max-w-[92%] animate-in fade-in slide-in-from-bottom-2 duration-200",
                msg.role === 'user' ? "ml-auto flex-row-reverse" : "mr-auto"
            )}>
                {/* Avatar */}
                <div
                    className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
                    style={{ background: msg.role === 'user' ? 'var(--avatar-user-bg)' : 'var(--avatar-ai-bg)' }}
                    aria-label={msg.role === 'user' ? t('user', language) : t('ai', language)}
                    data-testid={`avatar-${msg.role}`}
                >
                    {msg.role === 'user' ? (
                        userInitials
                            ? <span className="text-[10px] font-bold text-white">{userInitials}</span>
                            : <User className="w-3.5 h-3.5 text-white" />
                    ) : (
                        <Bot className="w-3.5 h-3.5 text-white" aria-hidden="true" />
                    )}
                </div>

                {/* Bubble + actions */}
                <div className="flex flex-col gap-1.5 min-w-0">
                    <div
                        className={cn(
                            "px-3.5 py-2.5 shadow-sm border text-sm leading-relaxed",
                            msg.role === 'user'
                                ? "rounded-[16px_16px_4px_16px] text-white"
                                : "rounded-[16px_16px_16px_4px]"
                        )}
                        style={{
                            background: msg.role === 'user'
                                ? 'var(--message-user-bg)'
                                : 'var(--message-ai-bg)',
                            borderColor: 'var(--border-color)',
                            backdropFilter: msg.role === 'ai' ? 'var(--backdrop-blur)' : undefined,
                            color: msg.role === 'ai' ? 'var(--text-color)' : undefined,
                        }}
                    >
                        <MarkdownContent content={msg.content} role={msg.role} />
                        {msg.imageUrl && (
                            <a href={msg.imageUrl} target="_blank" rel="noopener noreferrer" className="block mt-2">
                                <img
                                    src={msg.imageUrl}
                                    alt={msg.content}
                                    className="rounded-xl max-w-full max-h-64 object-contain border border-border/30 hover:opacity-90 transition-opacity"
                                />
                            </a>
                        )}
                    </div>

                    {msg.actions && (
                        <div className="flex flex-wrap gap-1.5 mt-0.5 px-1">
                            {msg.actions.map((act, idx) => (
                                <Button
                                    key={idx}
                                    variant={act.primary ? "default" : "outline"}
                                    size="sm"
                                    className={cn(
                                        "h-7 text-[11px] font-semibold py-1 rounded-full cursor-pointer",
                                        act.primary && "shadow-md"
                                    )}
                                    style={act.primary ? { background: 'var(--message-user-bg)', color: 'white', borderColor: 'transparent' } : undefined}
                                    onClick={() => onActionClick?.(act.action)}
                                    disabled={disableActions}
                                >
                                    {act.primary && <Sparkles className="w-3 h-3 mr-1" />}
                                    {act.label}
                                </Button>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        ))}
        <div ref={bottomRef} className="h-3" />
    </div>
);
```

Also update `MarkdownContent` so text colour is always inherited (remove the hard role-based text colour class):

```tsx
const MarkdownContent = ({ content, role }: { content: string, role: 'user' | 'ai' }) => {
    const [html, setHtml] = useState(content);

    useEffect(() => {
        Promise.resolve(marked.parse(content)).then(h => setHtml(h));
    }, [content]);

    return (
        <div
            className={cn(
                "prose prose-sm max-w-none break-words",
                "text-[13px] leading-relaxed",
                "[&_p]:mb-2 [&_p:last-child]:mb-0",
                "[&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5",
                "[&_code]:bg-black/10 [&_code]:px-1 [&_code]:rounded [&_code]:font-mono",
                "[&_pre]:p-3 [&_pre]:rounded-xl [&_pre]:overflow-x-auto [&_pre]:mb-2 [&_pre]:text-[12px]"
            )}
            dangerouslySetInnerHTML={{ __html: html }}
        />
    );
};
```

- [ ] **Run tests**

```bash
bun run test -- --testPathPattern="MessageList"
```

Expected: all MessageList tests pass.

- [ ] **Commit**

```bash
git add src/sidebar/components/Chat/MessageList.tsx
git commit -m "feat: glassmorphism bubbles, avatars, and action chips"
```

---

## Task 7 — InputArea.tsx: glass container + send button

**Files:**
- Modify: `src/sidebar/components/Chat/InputArea.tsx`

The container and send button need inline styles for glass background and gradient fill respectively.

- [ ] **Replace the `return` statement**

```tsx
return (
    <div
        className="px-3 py-2.5 border-t space-y-2.5 animate-in fade-in slide-in-from-bottom-4 duration-500 backdrop-blur-md"
        style={{ background: 'var(--header-bg)', borderColor: 'var(--border-color)' }}
    >
        {/* Toolbar */}
        <div className="flex items-center gap-1">
            <button
                className="h-7 w-7 rounded-lg flex items-center justify-center transition-colors cursor-pointer"
                style={{ color: 'var(--secondary-text)' }}
                title={t('analyzePage', language)}
                onClick={onScanPage}
                disabled={isScanning || disabled}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,0,0,0.06)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
                {isScanning
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" style={{ color: 'var(--accent-color)' }} />
                    : <FileText className="h-3.5 w-3.5" />}
            </button>

            {exaEnabled && (
                <button
                    className="h-7 w-7 rounded-lg flex items-center justify-center transition-colors cursor-pointer"
                    style={{
                        color: isSearchMode ? 'var(--accent-color)' : 'var(--secondary-text)',
                        background: isSearchMode ? 'color-mix(in srgb, var(--accent-color) 12%, transparent)' : 'transparent',
                    }}
                    title={isSearchMode ? t('closeSearch', language) : t('searchWeb', language)}
                    onClick={handleToggleSearch}
                    disabled={disabled}
                >
                    {isSearchMode ? <X className="h-3.5 w-3.5" /> : <Search className="h-3.5 w-3.5" />}
                </button>
            )}

            {imageGenEnabled && (
                <button
                    className="h-7 w-7 rounded-lg flex items-center justify-center transition-colors cursor-pointer"
                    style={{
                        color: isImageMode ? 'var(--accent-color)' : 'var(--secondary-text)',
                        background: isImageMode ? 'color-mix(in srgb, var(--accent-color) 12%, transparent)' : 'transparent',
                    }}
                    title={t('imageGen', language)}
                    onClick={handleToggleImageMode}
                    disabled={disabled}
                >
                    <ImageIcon className="h-3.5 w-3.5" />
                </button>
            )}

            {isSearchMode && (
                <div className="flex-1 flex gap-1.5 animate-in slide-in-from-left-2 fade-in duration-200">
                    <input
                        ref={searchInputRef}
                        id="search-input"
                        placeholder={t('searchPlaceholder', language)}
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onKeyDown={handleSearchKeyDown}
                        disabled={disabled}
                        className="flex-1 h-7 text-xs rounded-lg px-2.5 outline-none"
                        style={{ background: 'var(--input-bg)', border: '1px solid var(--border-color)', color: 'var(--text-color)' }}
                    />
                    <button
                        className="h-7 px-2.5 text-[11px] font-bold rounded-lg text-white cursor-pointer disabled:opacity-50"
                        style={{ background: 'var(--message-user-bg)' }}
                        onClick={handleSearchSubmit}
                        disabled={!searchQuery.trim() || disabled}
                    >
                        {t('search', language)}
                    </button>
                </div>
            )}
        </div>

        {/* Input row */}
        <div className="flex items-end gap-2">
            <textarea
                id="chat-input"
                ref={textareaRef}
                placeholder={isImageMode ? t('imageGenPromptPlaceholder', language) : t('askAnything', language)}
                rows={1}
                value={text}
                onChange={handleInput}
                onKeyDown={handleKeyDown}
                disabled={disabled}
                className="flex-1 min-h-[38px] max-h-[150px] rounded-xl px-3.5 py-2.5 text-[13px] resize-none outline-none transition-all duration-200"
                style={{
                    background: 'var(--input-bg)',
                    border: '1px solid var(--border-color)',
                    color: 'var(--text-color)',
                    backdropFilter: 'var(--backdrop-blur)',
                    opacity: disabled ? 0.5 : 1,
                }}
                onFocus={e => { e.currentTarget.style.borderColor = 'var(--accent-color)'; e.currentTarget.style.boxShadow = '0 0 0 3px color-mix(in srgb, var(--accent-color) 12%, transparent)'; }}
                onBlur={e => { e.currentTarget.style.borderColor = 'var(--border-color)'; e.currentTarget.style.boxShadow = 'none'; }}
            />
            <button
                id="send-btn"
                className="h-[38px] w-[38px] rounded-xl shrink-0 flex items-center justify-center text-white transition-all duration-150 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                style={{
                    background: text.trim() ? 'var(--message-user-bg)' : 'var(--border-color)',
                    transform: text.trim() ? 'scale(1)' : 'scale(0.95)',
                    boxShadow: text.trim() ? '0 4px 14px color-mix(in srgb, var(--accent-color) 28%, transparent)' : 'none',
                }}
                title={t('send', language)}
                aria-label={t('send', language)}
                disabled={!text.trim() || disabled}
                onClick={handleSend}
            >
                {isImageMode
                    ? <ImageIcon className="h-4 w-4" />
                    : <Send className="h-4 w-4" />
                }
            </button>
        </div>
    </div>
);
```

Note: native `<button>` and `<input>` elements replace the shadcn `Button`/`Input` wrappers here because the toolbar buttons need very specific sizing that conflicts with shadcn's fixed height variants. The `<textarea>` and `<button>` elements keep the existing `id` attributes (`chat-input`, `send-btn`) so tests continue to find them.

Also update the import block at the top of `InputArea.tsx` — remove the now-unused shadcn imports:

```tsx
import React, { useState, useRef } from 'react';
import { t } from '../../i18n';
import { FileText, Search, Send, X, Loader2, ImageIcon } from 'lucide-react';
```

(Remove: `import { Button } from '../ui/button';` and `import { Input } from '../ui/input';` and `import { cn } from '../../lib/utils';`)

- [ ] **Run tests**

```bash
bun run test -- --testPathPattern="InputArea"
```

Expected: all InputArea tests pass.

- [ ] **Commit**

```bash
git add src/sidebar/components/Chat/InputArea.tsx
git commit -m "feat: glassmorphism input area with gradient send button"
```

---

## Task 8 — SettingsView.tsx: glass cards with coloured icon tiles

**Files:**
- Modify: `src/sidebar/components/Settings/SettingsView.tsx`

Each settings card gets a coloured gradient icon tile in its header. The container background uses an inline style. The save button uses a gradient.

- [ ] **Update the container div** (the outermost div in the return statement)

Change:
```tsx
<div className="flex flex-col h-full bg-background overflow-y-auto px-4 py-6 selection:bg-primary selection:text-primary-foreground">
```
To:
```tsx
<div
    className="flex flex-col h-full overflow-y-auto px-4 py-6 selection:bg-primary selection:text-primary-foreground"
    style={{ background: 'var(--bg-color)' }}
>
```

- [ ] **Add the `cardIconTile` helper** just before the `return` statement

```tsx
const cardIconTile = (gradient: string, icon: React.ReactNode) => (
    <div
        className="w-[22px] h-[22px] rounded-lg flex items-center justify-center shrink-0"
        style={{ background: gradient }}
    >
        <span className="text-white [&_svg]:w-[11px] [&_svg]:h-[11px]">{icon}</span>
    </div>
);
```

- [ ] **Update each Card header** to use `cardIconTile`

**AI Engine card** — replace:
```tsx
<div className="flex items-center gap-2">
    <Zap className={cn("w-4 h-4", providerBackend === 'vercel' ? "text-primary" : "text-muted-foreground")} />
    <CardTitle className="text-lg">{translate('providerEngine', language)}</CardTitle>
</div>
```
With:
```tsx
<div className="flex items-center gap-2">
    {cardIconTile('linear-gradient(135deg, #2c70a3, #3b82f6)', <Zap />)}
    <CardTitle className="text-base">{translate('providerEngine', language)}</CardTitle>
</div>
```

**Model & Auth card** — replace:
```tsx
<div className="flex items-center gap-2">
    <Settings2 className="w-4 h-4 text-primary" />
    <CardTitle className="text-sm">{translate('modelAndAuth', language)}</CardTitle>
</div>
```
With:
```tsx
<div className="flex items-center gap-2">
    {cardIconTile('linear-gradient(135deg, #0369a1, #38bdf8)', <Settings2 />)}
    <CardTitle className="text-sm">{translate('modelAndAuth', language)}</CardTitle>
</div>
```

**Appearance card** — replace:
```tsx
<div className="flex items-center gap-2">
    <Palette className="w-4 h-4 text-primary" />
    <CardTitle className="text-sm">{translate('appearanceAndApp', language)}</CardTitle>
</div>
```
With:
```tsx
<div className="flex items-center gap-2">
    {cardIconTile('linear-gradient(135deg, #2e7d32, #4ade80)', <Palette />)}
    <CardTitle className="text-sm">{translate('appearanceAndApp', language)}</CardTitle>
</div>
```

**SearXNG card** — replace:
```tsx
<div className="flex items-center gap-2">
    <Search className="w-4 h-4 text-primary" />
    <CardTitle className="text-sm">{translate('searxngSearch', language)}</CardTitle>
</div>
```
With:
```tsx
<div className="flex items-center gap-2">
    {cardIconTile('linear-gradient(135deg, #d97706, #fbbf24)', <Search />)}
    <CardTitle className="text-sm">{translate('searxngSearch', language)}</CardTitle>
</div>
```

**Image Gen card** — replace:
```tsx
<div className="flex items-center gap-2">
    <ImageIcon className="w-4 h-4 text-primary" />
    <CardTitle className="text-sm">{translate('imageGen', language)}</CardTitle>
</div>
```
With:
```tsx
<div className="flex items-center gap-2">
    {cardIconTile('linear-gradient(135deg, #db2777, #f472b6)', <ImageIcon />)}
    <CardTitle className="text-sm">{translate('imageGen', language)}</CardTitle>
</div>
```

**Exam Tools card** — replace:
```tsx
<div className="flex items-center gap-2">
    <Wand2 className="w-4 h-4 text-primary" />
    <CardTitle className="text-sm">Exam Tools</CardTitle>
</div>
```
With:
```tsx
<div className="flex items-center gap-2">
    {cardIconTile('linear-gradient(135deg, #7c3aed, #a78bfa)', <Wand2 />)}
    <CardTitle className="text-sm">Exam Tools</CardTitle>
</div>
```

- [ ] **Update the save button** in the `<footer>`

Replace:
```tsx
<Button id="save-key-btn" className="w-full font-bold shadow-md h-12" onClick={handleSave}>
```
With:
```tsx
<Button
    id="save-key-btn"
    className="w-full font-bold h-11 rounded-xl text-white border-0"
    style={{ background: 'var(--message-user-bg)', boxShadow: '0 4px 14px color-mix(in srgb, var(--accent-color) 28%, transparent)' }}
    onClick={handleSave}
>
```

- [ ] **Run tests**

```bash
bun run test -- --testPathPattern="SettingsView"
```

Expected: all SettingsView tests pass.

- [ ] **Commit**

```bash
git add src/sidebar/components/Settings/SettingsView.tsx
git commit -m "feat: glassmorphism settings cards with coloured icon tiles"
```

---

## Task 9 — WidgetsView.tsx: container background

**Files:**
- Modify: `src/sidebar/components/Widgets/WidgetsView.tsx`

One-line change: the outermost `div` uses an inline background so the gradient shows through instead of the flat `bg-background` colour.

- [ ] **Replace the container className/style**

Change:
```tsx
<div className="flex flex-col h-full bg-background overflow-y-auto px-4 py-6 space-y-4">
```
To:
```tsx
<div
    className="flex flex-col h-full overflow-y-auto px-4 py-6 space-y-4"
    style={{ background: 'var(--bg-color)' }}
>
```

- [ ] **Commit**

```bash
git add src/sidebar/components/Widgets/WidgetsView.tsx
git commit -m "feat: apply gradient background to widgets view"
```

---

## Task 10 — Full build + final test run

**Files:** none

- [ ] **Run the full test suite**

```bash
bun run test
```

Expected: all tests pass.

- [ ] **Build for Chrome**

```bash
bun run build:chrome
```

Expected: exits 0, produces `dist-chrome/` with `sidebar.html`, `sidebar.js`, `sidebar.css`, `tailwind.css`.

- [ ] **Load the extension in the browser**

1. Open `chrome://extensions` (or `brave://extensions`)
2. Enable "Developer mode"
3. Click "Load unpacked" → select `dist-chrome/`
4. Open EduPage in a tab, click the extension icon
5. Verify:
   - Header has gradient logo tile and glass background
   - AI messages have frosted glass bubble, user messages have blue gradient bubble
   - Typing indicator bounces
   - Input area is glassy with gradient send button
   - Settings cards have coloured icon tiles
   - Widgets view has gradient background
   - Theme switcher: change to Tokyo Night, Discord, iMessage — each should look correct
   - Inter font is loading (check Network tab for `fonts.googleapis.com`)

- [ ] **Build remaining targets and verify no errors**

```bash
bun run build:firefox && bun run build:safari
```

Expected: both exit 0.

- [ ] **Final commit**

```bash
git add -A
git commit -m "feat: complete glassmorphism redesign — all views and 6 themes"
```
