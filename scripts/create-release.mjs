#!/usr/bin/env bun
/**
 * Creates a Forgejo (Codeberg) Release for the current tag and attaches the
 * built browser artifacts as downloadable release assets. Replaces the old
 * GitLab package-registry + asset-links flow with Forgejo's native release
 * assets (uploaded directly to the release).
 *
 *   1. Extracts the changelog section from book/src/changelog.md
 *   2. Creates the Forgejo Release (or updates its description if it exists)
 *   3. Uploads aipage-chrome.zip / aipage-firefox.xpi / aipage-safari.zip as
 *      release assets, so the extension's update-checker can fetch
 *      /releases/latest and download the matching asset.
 *
 * Required env vars (set by the Forgejo Actions release workflow):
 *   FORGEJO_API   – e.g. "https://codeberg.org/api/v1"   (default below)
 *   REPOSITORY    – "owner/repo", e.g. "dasmatus/aipage"
 *   TAG           – e.g. "v1.8.0"  (github.ref_name)
 *   TOKEN         – the GITHUB_TOKEN (or a bot token) with `contents: write`
 */

import fs from 'fs';
import path from 'path';

const API_BASE = process.env.FORGEJO_API ?? 'https://codeberg.org/api/v1';
const REPO     = process.env.REPOSITORY ?? '';
const TAG      = process.env.TAG ?? '';
const TOKEN    = process.env.TOKEN ?? '';
const WEB_BASE = process.env.FORGEJO_WEB ?? 'https://codeberg.org';

for (const [k, v] of Object.entries({ REPOSITORY: REPO, TAG, TOKEN })) {
    if (!v) { console.error(`Missing required env var: ${k}`); process.exit(1); }
}

const VERSION = TAG.replace(/^v/, ''); // "1.8.0"

function authHeaders(extra = {}) {
    return { Authorization: `token ${TOKEN}`, ...extra };
}

// ── 1. Extract changelog section ──────────────────────────────────────────────

function extractChangelogSection(version) {
    const changelogPath = 'book/src/changelog.md';
    if (!fs.existsSync(changelogPath)) {
        console.warn('changelog.md not found — release will have no description.');
        return '';
    }
    const content = fs.readFileSync(changelogPath, 'utf8');
    const escaped = version.replace(/\./g, '\\.');
    const headerRe = new RegExp(`^## \\[v?${escaped}\\]`, 'm');
    const start = content.search(headerRe);
    if (start === -1) {
        console.warn(`No changelog entry for ${version} — release will have no description.`);
        return '';
    }
    const rest = content.slice(start);
    const nextSection = rest.slice(1).search(/^## /m);
    return (nextSection === -1 ? rest : rest.slice(0, nextSection + 1)).trim();
}

const releaseNotes = extractChangelogSection(VERSION);
console.log(`Changelog section: ${releaseNotes.length} chars`);

// ── 2. Create (or fetch existing) Forgejo Release ──────────────────────────────

const releaseBody = {
    tag_name: TAG,
    name:     `AIPage ${TAG}`,
    body:     releaseNotes || `Release ${TAG}`,
};

async function apiFetch(method, urlPath, { json, body, headers } = {}) {
    const res = await fetch(`${API_BASE}${urlPath}`, {
        method,
        headers: authHeaders(json || body ? { 'Content-Type': 'application/json', ...(headers ?? {}) } : (headers ?? {})),
        body: json ? JSON.stringify(json) : body,
    });
    return { ok: res.ok, status: res.status, text: await res.text() };
}

console.log(`\nCreating Forgejo Release ${TAG} …`);
let releaseId;
let r = await apiFetch('POST', `/repos/${REPO}/releases`, { json: releaseBody });

if (r.ok) {
    releaseId = JSON.parse(r.text).id;
} else if (r.status === 409) {
    // Release already exists — look it up by tag and update the description.
    console.log('Release already exists, fetching + updating description …');
    const g = await apiFetch('GET', `/repos/${REPO}/releases/tags/${encodeURIComponent(TAG)}`);
    if (!g.ok) throw new Error(`Could not fetch existing release (${g.status}): ${g.text}`);
    releaseId = JSON.parse(g.text).id;
    const u = await apiFetch('PATCH', `/repos/${REPO}/releases/${releaseId}`, {
        json: { name: releaseBody.name, body: releaseBody.body },
    });
    if (!u.ok) throw new Error(`Release update failed (${u.status}): ${u.text}`);
} else {
    throw new Error(`Release creation failed (${r.status}): ${r.text}`);
}
console.log(`  ✅ release id ${releaseId}`);

// ── 3. Upload assets as release attachments ───────────────────────────────────

// Forgejo upload endpoint expects multipart/form-data with an `attachment` field.
async function uploadAsset(localPath, assetName) {
    if (!fs.existsSync(localPath)) throw new Error(`Asset not found: ${localPath}`);
    const bytes = fs.readFileSync(localPath);
    console.log(`Uploading ${localPath} → ${assetName} …`);
    const form = new FormData();
    form.append('attachment', new Blob([bytes]), assetName);
    const res = await fetch(
        `${API_BASE}/repos/${REPO}/releases/${releaseId}/assets?name=${encodeURIComponent(assetName)}`,
        { method: 'POST', headers: authHeaders(), body: form },
    );
    if (!res.ok) throw new Error(`Upload of ${assetName} failed (${res.status}): ${await res.text()}`);
    console.log(`  ✅ ${assetName}`);
}

// Firefox XPI has a generated filename; find it before uploading.
const xpiFiles = fs.readdirSync('packages').filter((f) => f.endsWith('.xpi'));
if (xpiFiles.length === 0) throw new Error('No .xpi file found in packages/');

await uploadAsset('aipage-chrome.zip', 'aipage-chrome.zip');
await uploadAsset('aipage-safari.zip', 'aipage-safari.zip');
await uploadAsset(path.join('packages', xpiFiles[0]), 'aipage-firefox.xpi');

console.log(`\n🎉 Done: ${WEB_BASE}/${REPO}/releases/tag/${TAG}`);