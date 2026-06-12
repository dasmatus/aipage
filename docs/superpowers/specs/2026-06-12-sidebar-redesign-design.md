# EduPage AI Sidebar — Glassmorphism Redesign

**Date:** 2026-06-12  
**Scope:** Full redesign — chat view, settings view, widgets view, theme system  
**Stack:** React · Tailwind CSS · shadcn/ui · Lucide icons (unchanged)

---

## Design Direction

**Style:** Glassmorphism — frosted semi-transparent panels, `backdrop-filter: blur(12px)`, soft gradient backgrounds, subtle borders at `rgba(accent, 0.12–0.18)`.

**Font:** Inter (replacing Arial). Loaded via Google Fonts link in `sidebar.html`: `https://fonts.googleapis.com/css2?family=Inter:wght@400..700&display=swap`. The sidebar already has network access (it runs inside the browser), so a CDN link is fine. No local bundling needed.

**Radius:** 12–16px on cards/bubbles; 8–10px on buttons and inputs; 50% on avatars.

**Shadows:** Subtle only — `0 1px 3px rgba(0,0,0,0.06)` for panels, `0 4px 14px rgba(accent, 0.28)` for primary CTA buttons. No hard drop shadows.

---

## Color Tokens

All six themes define the same set of CSS custom properties. Light themes use frosted-white glass panels on a soft gradient background; dark themes use frosted-dark panels on a deep background.

### Default theme — EduPage

| Token | Value | Notes |
|---|---|---|
| `--bg-color` | `linear-gradient(160deg, #dbeafe 0%, #ecfdf5 50%, #e0f2fe 100%)` | Soft blue→green gradient — must be applied via `background` shorthand, not `background-color` (gradients are invalid in background-color) |
| `--card-bg` | `rgba(255,255,255,0.72)` | Glass panel |
| `--backdrop-blur` | `blur(12px)` | Applied to header, bubbles, input area |
| `--text-color` | `#0c4a6e` | Sky-900 |
| `--secondary-text` | `#64748b` | Slate-500 |
| `--heading-color` | `#0c4a6e` | Same as text |
| `--accent-color` | `#2c70a3` | EduPage blue (primary) |
| `--avatar-ai-bg` value | see below | `--accent-secondary` is not a separate token; the green is encoded directly in `--avatar-ai-bg` |
| `--accent-text` | `#ffffff` | |
| `--border-color` | `rgba(44,112,163,0.15)` | Tinted glass border |
| `--message-user-bg` | `linear-gradient(135deg, #2c70a3, #3b82f6)` | User bubble |
| `--message-ai-bg` | `rgba(255,255,255,0.75)` | AI bubble (glass) |
| `--input-bg` | `rgba(255,255,255,0.60)` | Input field |
| `--header-bg` | `rgba(255,255,255,0.70)` | Header strip |
| `--header-height` | `48px` | Up from 43px |
| `--bubble-radius` | `16px` | |
| `--avatar-ai-bg` | `linear-gradient(135deg, #2e7d32, #4ade80)` | Green gradient |
| `--avatar-user-bg` | `linear-gradient(135deg, #2c70a3, #3b82f6)` | Blue gradient |

### iMessage theme

Same glass treatment on a white background. Accent `#007AFF`. User bubble `#007AFF`, AI bubble `rgba(233,233,235,0.85)`.

### Gradient / Messenger theme

Dark background `#000000`. Glass panels `rgba(255,255,255,0.06)`. User bubble: `linear-gradient(135deg, #7928ca, #ff0080)`. Border `rgba(255,255,255,0.08)`.

### Discord theme

Background `#313338`. Glass panels `rgba(47,49,54,0.85)`. Accent `#5865f2`. Bubble radius `0` (kept per existing Discord aesthetic). Border `rgba(255,255,255,0.05)`.

### Tokyo Night theme

Background `#1a1b26`. Glass panels `rgba(36,40,59,0.88)`. Accent `#7aa2f7`. Secondary `#bb9af7`. Border `rgba(122,162,247,0.12)`.

### Mono theme

Background `#ffffff`. Glass panels `rgba(255,255,255,0.85)`. All accents `#000000`. Bubble radius `0`. Border `1px solid #000000`.

---

## Layout & Components

### Header (`App.tsx`)

- Height: `48px` (was 43px)
- Background: `var(--header-bg)` with `backdrop-filter: var(--backdrop-blur)`
- Left: logo icon tile (8×8 gradient rounded square) + bold title
- Right: icon buttons — Widgets, Settings (and optionally Wand2 when auto-answer enabled)
- Icon buttons: `28×28px`, `border-radius: 8px`, background `rgba(accent, 0.08)` on hover

### Chat view — MessageList

- Scroll container: `flex-1 overflow-y-auto px-3 py-4 space-y-3`
- **AI bubble:** `background: var(--message-ai-bg)`, `backdrop-filter: blur(8px)`, `border: 1px solid var(--border-color)`, `border-radius: 16px 16px 16px 4px`
- **User bubble:** `background: var(--message-user-bg)`, `border-radius: 16px 16px 4px 16px`, `color: white`
- **Avatar:** `28×28px` circle, gradient fill (`--avatar-ai-bg` / `--avatar-user-bg`), no border
- **Action chips:** `font-size: 11px`, `font-weight: 600`, `border-radius: 20px`, glass background (`rgba(accent, 0.10)`), tinted border
- **Typing indicator:** three bouncing dots using `--accent-color`
- `animate-in fade-in slide-in-from-bottom-2 duration-200` on each new message

### Chat view — InputArea

- Container: `padding: 10px 12px`, `background: var(--header-bg)`, `backdrop-filter: var(--backdrop-blur)`, `border-top: 1px solid var(--border-color)`
- Toolbar row (above textarea): scan-page, web-search, image-gen icon buttons at `28×28px`
- Textarea: `background: var(--input-bg)`, `border: 1px solid var(--border-color)`, `border-radius: 12px`, `min-height: 38px`, `max-height: 150px`; focus ring uses `--accent-color` at 20% opacity
- Send button: `38×38px`, `border-radius: 11px`, `background: var(--message-user-bg)` (gradient), shadow `0 4px 14px rgba(accent, 0.28)`; dims to `bg-muted` when textarea is empty

### Settings view — SettingsView

- Background: `var(--bg-color)` (gradient, same as chat)
- Each section: `Card` with `background: var(--card-bg)`, `backdrop-filter: blur(8px)`, `border: 1px solid var(--border-color)`, `border-radius: 14px`
- Card header: small gradient icon tile (22×22px) + section title, separated by a faint border
- Card content: consistent `padding: 12px 14px`, `gap: 10px`
- Each setting card gets a distinct accent gradient for its icon: AI Engine → blue, Appearance → green, Search → amber, Image Gen → pink, Exam Tools → purple
- Save button: full-width, `height: 42px`, gradient fill matching default accent, `border-radius: 12px`, shadow

### Widgets view

No layout change required — apply the same glass card style to any widget containers that exist.

---

## Typography

All text uses **Inter**. No other font family.

| Usage | Size | Weight | Notes |
|---|---|---|---|
| Header title | 13.5px | 700 | `letter-spacing: -0.3px` |
| Message body | 13px | 450 | `line-height: 1.55` — Inter variable font; the `wght@400..700` range import covers 450 |
| Section labels | 10px | 700 | `text-transform: uppercase; letter-spacing: 1.2px` |
| Action chips | 11px | 600 | |
| Settings labels | 11–12px | 500 | |
| Hint / muted text | 11px | 400 | `color: var(--secondary-text)` |
| Code inline | 12px | 400 | `font-family: 'Consolas', 'Monaco', monospace` |

---

## Animations

- Message enter: `animate-in fade-in slide-in-from-bottom-2 duration-200`
- View transition (chat↔settings↔widgets): `transition: transform 400ms cubic-bezier(0.4,0,0.2,1), opacity 300ms`
- Send button scale: `transform: scale(1.0)` when text present, `scale(0.95)` when empty, `transition: 150ms`
- Icon button hover: `transition: background 150ms`
- Typing dots: keyframe bounce, 1.2s loop, staggered 200ms

All animations respect `prefers-reduced-motion`: wrap keyframes in `@media (prefers-reduced-motion: no-preference)`.

---

## Accessibility

- Minimum contrast 4.5:1 for all body text (verified: `#0c4a6e` on `rgba(255,255,255,0.72)` ≈ 7:1)
- All icon-only buttons keep existing `aria-label` attributes
- Focus ring: `outline: 2px solid var(--accent-color); outline-offset: 2px` on all interactive elements
- Send button: `disabled` state keeps `cursor: not-allowed`, reduced opacity
- `cursor: pointer` on all clickable elements (action chips, cards, toolbar buttons)

---

## Files to Change

| File | Change |
|---|---|
| `src/sidebar/sidebar.scss` | Replace all theme variable values with glassmorphism tokens; add `--backdrop-blur`, `--avatar-ai-bg`, `--avatar-user-bg` variables |
| `src/sidebar/tailwind.css` | Update `:root` token values to match new EduPage default palette |
| `src/sidebar/sidebar.html` | Add Inter font `<link>` |
| `src/sidebar/App.tsx` | Update header layout (height, icon tile, button styles) |
| `src/sidebar/components/Chat/MessageList.tsx` | Update bubble classes, avatar styles, action chip styles |
| `src/sidebar/components/Chat/InputArea.tsx` | Update container, toolbar, textarea, send button styles |
| `src/sidebar/components/Settings/SettingsView.tsx` | Update card headers (icon tiles), card body padding, save button |
| `tailwind.config.js` | No structural change needed; token values flow through SCSS vars |

---

## Out of Scope

- No changes to business logic, providers, storage, or i18n
- No changes to content scripts or background service worker
- No new features
- Widgets view: glass card style applied, no layout restructuring
