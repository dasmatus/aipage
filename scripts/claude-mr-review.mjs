#!/usr/bin/env bun
/**
 * Claude MR Reviewer
 * Posts a thorough code review as a GitLab note on the current MR.
 * Skips if a review for the current commit SHA already exists.
 *
 * Required env vars:
 *   ANTHROPIC_API_KEY   – Anthropic API key
 *   GITLAB_BOT_TOKEN    – GitLab personal access token with `api` scope
 *   CI_API_V4_URL       – Set automatically by GitLab CI
 *   CI_PROJECT_ID       – Set automatically by GitLab CI
 *   CI_MERGE_REQUEST_IID – Set automatically by GitLab CI
 *   CI_COMMIT_SHA       – Set automatically by GitLab CI
 */

const GITLAB_API  = process.env.CI_API_V4_URL  ?? 'https://gitlab.com/api/v4';
const PROJECT_ID  = process.env.CI_PROJECT_ID;
const MR_IID      = process.env.CI_MERGE_REQUEST_IID;
const TOKEN       = process.env.GITLAB_BOT_TOKEN;
const ANTHROPIC   = process.env.ANTHROPIC_API_KEY;
const COMMIT_SHA  = process.env.CI_COMMIT_SHA ?? 'unknown';

for (const [k, v] of Object.entries({ PROJECT_ID, MR_IID, TOKEN, ANTHROPIC })) {
    if (!v) { console.error(`Missing required env var: ${k}`); process.exit(1); }
}

const BOT_MARKER = `<!-- claude-review:${COMMIT_SHA} -->`;
const MAX_DIFF_CHARS = 32_000;

// ── GitLab helpers ────────────────────────────────────────────────────────────

async function glFetch(path, opts = {}) {
    const res = await fetch(`${GITLAB_API}${path}`, {
        ...opts,
        headers: { 'PRIVATE-TOKEN': TOKEN, 'Content-Type': 'application/json', ...opts.headers },
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`GitLab API ${path} → ${res.status}: ${text}`);
    }
    return res.json();
}

async function getMR() {
    return glFetch(`/projects/${PROJECT_ID}/merge_requests/${MR_IID}`);
}

async function getMRChanges() {
    return glFetch(`/projects/${PROJECT_ID}/merge_requests/${MR_IID}/changes`);
}

async function getMRNotes() {
    // Fetch up to 100 notes; enough to check for an existing review
    return glFetch(`/projects/${PROJECT_ID}/merge_requests/${MR_IID}/notes?per_page=100`);
}

async function postMRNote(body) {
    return glFetch(`/projects/${PROJECT_ID}/merge_requests/${MR_IID}/notes`, {
        method: 'POST',
        body: JSON.stringify({ body }),
    });
}

// ── Claude helper ─────────────────────────────────────────────────────────────

async function callClaude(system, userContent) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'x-api-key': ANTHROPIC,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json',
        },
        body: JSON.stringify({
            model: 'claude-opus-4-6',
            max_tokens: 4096,
            system,
            messages: [{ role: 'user', content: userContent }],
        }),
    });
    const data = await res.json();
    const text = data.content?.[0]?.text;
    if (!text) throw new Error(`Claude returned no content: ${JSON.stringify(data)}`);
    return text;
}

// ── Main ──────────────────────────────────────────────────────────────────────

const [notes, mr, changesData] = await Promise.all([getMRNotes(), getMR(), getMRChanges()]);

// Deduplicate: skip if this commit was already reviewed
if (notes.some(n => n.body.includes(BOT_MARKER))) {
    console.log(`Review for ${COMMIT_SHA.slice(0, 8)} already posted — skipping.`);
    process.exit(0);
}

// Build diff string
let diff = (changesData.changes ?? [])
    .map(c => `--- ${c.old_path}\n+++ ${c.new_path}\n${c.diff}`)
    .join('\n\n');

if (diff.length > MAX_DIFF_CHARS) {
    diff = diff.slice(0, MAX_DIFF_CHARS) + '\n\n... (diff truncated to fit context window)';
}

if (!diff.trim()) {
    console.log('No diff found — skipping review.');
    process.exit(0);
}

const system = `\
You are reviewing merge requests for the EduPage AI Sidebar browser extension.
This is a cross-browser (Chrome, Firefox, Safari) extension that injects an AI-powered
chat sidebar into EduPage, an educational platform. You are the project maintainer.

Tech stack: TypeScript, React, Bun, Tailwind CSS, shadcn/ui, webextension-polyfill.

Key architecture rules (violations are bugs):
- ALL external HTTP calls must go through the background service worker via \`performRequest()\`
  in \`providers/utils.ts\` — never use \`fetch()\` directly in the sidebar or content scripts.
- Storage access must go through \`storage.ts\` — never call \`browser.storage\` directly in components.
- Three isolated JS contexts: background (CORS proxy), content script (page injection), sidebar iframe (React UI).
- MV2 manifests for all three browsers.
- New locale keys must be added to ALL six locale files (sk, en, cs, de, hu, interface.ts).

Review style:
- Be specific and direct. Name the exact file and line when pointing out issues.
- Group findings under clear headings (Security, Correctness, Architecture, Performance, Style/Types, Tests).
- If there are no issues in a category, omit the heading.
- End with a short **Summary** and a clear recommendation: Approve / Request changes / Approve with minor nits.
- Do not invent issues. If the MR is solid, say so.`;

const userMsg = `MR !${MR_IID}: **${mr.title}**

${mr.description ? `**Description:**\n${mr.description}\n\n` : ''}\
**Diff:**
\`\`\`diff
${diff}
\`\`\``;

console.log('Calling Claude for review…');
const review = await callClaude(system, userMsg);

const noteBody = `## 🤖 Claude Code Review

${review}

---
*Review generated by Claude (commit \`${COMMIT_SHA.slice(0, 8)}\`)*
${BOT_MARKER}`;

await postMRNote(noteBody);
console.log('✅ Review posted.');
