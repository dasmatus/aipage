#!/usr/bin/env bun
/**
 * Claude Issue Responder
 * Finds open GitLab issues without a bot reply and posts a helpful response.
 * Run on a schedule (e.g. every hour) via GitLab CI.
 *
 * Required env vars:
 *   VERCEL_API_KEY     – Vercel API key (used for the AI Gateway)
 *   GITLAB_BOT_TOKEN   – GitLab personal access token with `api` scope
 *   CI_API_V4_URL      – Set automatically by GitLab CI
 *   CI_PROJECT_ID      – Set automatically by GitLab CI
 */

const GITLAB_API = process.env.CI_API_V4_URL ?? 'https://gitlab.com/api/v4';
const PROJECT_ID = process.env.CI_PROJECT_ID;
const TOKEN      = process.env.GITLAB_BOT_TOKEN;
const VERCEL_KEY = process.env.VERCEL_API_KEY;

for (const [k, v] of Object.entries({ PROJECT_ID, TOKEN, VERCEL_KEY })) {
    if (!v) { console.error(`Missing required env var: ${k}`); process.exit(1); }
}

const BOT_MARKER = '<!-- claude-issue-reply -->';

// ── GitLab helpers ─────────────────────────────────────────────────────────────

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

async function getOpenIssues() {
    return glFetch(`/projects/${PROJECT_ID}/issues?state=opened&per_page=50&order_by=created_at&sort=asc`);
}

async function getIssueNotes(iid) {
    return glFetch(`/projects/${PROJECT_ID}/issues/${iid}/notes?per_page=100`);
}

async function postIssueNote(iid, body) {
    return glFetch(`/projects/${PROJECT_ID}/issues/${iid}/notes`, {
        method: 'POST',
        body: JSON.stringify({ body }),
    });
}

// ── Claude helper ──────────────────────────────────────────────────────────────

async function callClaude(system, userContent) {
    const res = await fetch('https://ai-gateway.vercel.sh/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${VERCEL_KEY}`,
            'content-type': 'application/json',
        },
        body: JSON.stringify({
            model: 'anthropic:claude-sonnet-4-6',
            max_tokens: 1024,
            messages: [
                { role: 'system', content: system },
                { role: 'user', content: userContent },
            ],
        }),
    });
    const data = await res.json();
    const text = data.choices?.[0]?.message?.content;
    if (!text) throw new Error(`Vercel AI Gateway returned no content: ${JSON.stringify(data)}`);
    return text;
}

// ── Main ───────────────────────────────────────────────────────────────────────

const system = `\
You are the maintainer of the EduPage AI Sidebar browser extension — a cross-browser
(Chrome, Firefox, Safari) extension that injects an AI-powered chat sidebar into EduPage,
an educational platform used primarily by students in Central Europe (Slovakia, Czech Republic,
Hungary, Germany). The extension allows students to chat with AI, scan page content, run web
searches, generate images, and auto-answer exam questions.

Tech stack: TypeScript, React, Bun, Tailwind CSS, shadcn/ui, webextension-polyfill, MV2.
Distribution: Chrome Web Store, Firefox Add-ons, Safari Extensions. Source on GitLab.

When responding to issues:
- Be helpful, concise, and friendly but not overly formal.
- For bug reports: ask for browser/version info if missing, suggest likely causes, outline debugging steps.
- For feature requests: acknowledge the idea, note if it fits the project direction, and if applicable
  point out where in the codebase one would implement it.
- For questions: answer directly and clearly.
- If the issue is a duplicate or clearly out of scope, say so politely.
- Write in the same language the user used (detect from their text). Default to English if unclear.
- Keep responses focused. Do not pad with filler.`;

const issues = await getOpenIssues();
console.log(`Found ${issues.length} open issue(s).`);

let replied = 0;

for (const issue of issues) {
    const notes = await getIssueNotes(issue.iid);

    // Skip if Claude already replied
    if (notes.some(n => n.body.includes(BOT_MARKER))) {
        console.log(`  #${issue.iid} — already replied, skipping.`);
        continue;
    }

    // Build context: issue body + any existing comments
    const comments = notes
        .filter(n => !n.system)
        .map(n => `**${n.author.name}:** ${n.body}`)
        .join('\n\n');

    const userMsg = `Issue #${issue.iid}: **${issue.title}**
Labels: ${issue.labels?.join(', ') || 'none'}

**Description:**
${issue.description || '(no description)'}

${comments ? `**Discussion so far:**\n${comments}` : ''}`;

    console.log(`  #${issue.iid} — generating reply…`);

    try {
        const reply = await callClaude(system, userMsg);

        const noteBody = `${reply}

${BOT_MARKER}`;

        await postIssueNote(issue.iid, noteBody);
        console.log(`  #${issue.iid} ✅ replied.`);
        replied++;

        // Brief pause to avoid rate-limiting
        await new Promise(r => setTimeout(r, 500));
    } catch (err) {
        console.error(`  #${issue.iid} ❌ failed: ${err.message}`);
    }
}

console.log(`\nDone. Replied to ${replied} issue(s).`);
