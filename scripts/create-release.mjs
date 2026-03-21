#!/usr/bin/env bun
/**
 * Creates a GitLab Release for the current tag:
 *   1. Extracts the changelog section from book/src/changelog.md
 *   2. Uploads built packages to the GitLab Generic Packages Registry
 *   3. Creates the GitLab Release with the changelog as description
 *   4. Attaches download links for Chrome/Firefox/Safari packages
 *
 * Required env vars (all set automatically in GitLab CI except GITLAB_BOT_TOKEN):
 *   GITLAB_BOT_TOKEN  – personal access token with `api` scope
 *   CI_COMMIT_TAG     – e.g. "v1.8.0"
 *   CI_PROJECT_ID
 *   CI_API_V4_URL
 *   CI_PROJECT_PATH   – e.g. "TenTypekMatus/aipage"
 */

import fs from 'fs';
import path from 'path';

const GITLAB_API = process.env.CI_API_V4_URL ?? 'https://gitlab.com/api/v4';
const PROJECT_ID = process.env.CI_PROJECT_ID;
const TOKEN      = process.env.GITLAB_BOT_TOKEN;
const TAG        = process.env.CI_COMMIT_TAG;
const PROJECT    = process.env.CI_PROJECT_PATH ?? '';

for (const [k, v] of Object.entries({ PROJECT_ID, TOKEN, TAG })) {
    if (!v) { console.error(`Missing required env var: ${k}`); process.exit(1); }
}

const VERSION = TAG.replace(/^v/, ''); // "1.8.0"

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

// ── 2. Upload packages to Generic Packages Registry ───────────────────────────

async function upload(localPath, remoteFilename) {
    if (!fs.existsSync(localPath)) throw new Error(`Package not found: ${localPath}`);
    console.log(`Uploading ${localPath} → ${remoteFilename} …`);
    const body = fs.readFileSync(localPath);
    const url = `${GITLAB_API}/projects/${PROJECT_ID}/packages/generic/aipage/${VERSION}/${remoteFilename}`;
    const res = await fetch(url, {
        method: 'PUT',
        headers: { 'PRIVATE-TOKEN': TOKEN, 'Content-Type': 'application/octet-stream' },
        body,
    });
    if (!res.ok) throw new Error(`Upload of ${remoteFilename} failed (${res.status}): ${await res.text()}`);
    console.log(`  ✅ ${remoteFilename}`);
    return url;
}

const chromeUrl  = await upload('aipage-chrome.zip', 'aipage-chrome.zip');
const safariUrl  = await upload('aipage-safari.zip', 'aipage-safari.zip');

// Firefox XPI has a generated filename; find it
const xpiFiles = fs.readdirSync('packages').filter(f => f.endsWith('.xpi'));
if (xpiFiles.length === 0) throw new Error('No .xpi file found in packages/');
const firefoxUrl = await upload(path.join('packages', xpiFiles[0]), 'aipage-firefox.xpi');

// ── 3. Create (or update) the GitLab Release ──────────────────────────────────

console.log(`\nCreating GitLab Release ${TAG} …`);

async function glFetch(method, path, body) {
    const res = await fetch(`${GITLAB_API}${path}`, {
        method,
        headers: { 'PRIVATE-TOKEN': TOKEN, 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
    });
    return { ok: res.ok, status: res.status, text: await res.text() };
}

const releaseBody = {
    tag_name:    TAG,
    name:        `AIPage ${TAG}`,
    description: releaseNotes || `Release ${TAG}`,
};

let r = await glFetch('POST', `/projects/${PROJECT_ID}/releases`, releaseBody);

if (!r.ok) {
    if (r.status === 409) {
        // Already exists — update description
        console.log('Release already exists, updating description …');
        r = await glFetch('PUT', `/projects/${PROJECT_ID}/releases/${encodeURIComponent(TAG)}`, {
            name:        releaseBody.name,
            description: releaseBody.description,
        });
        if (!r.ok) throw new Error(`Release update failed (${r.status}): ${r.text}`);
    } else {
        throw new Error(`Release creation failed (${r.status}): ${r.text}`);
    }
}

// ── 4. Attach asset links ─────────────────────────────────────────────────────

async function addLink(name, url) {
    const r = await glFetch(
        'POST',
        `/projects/${PROJECT_ID}/releases/${encodeURIComponent(TAG)}/assets/links`,
        { name, url, link_type: 'package' },
    );
    if (!r.ok) console.warn(`  ⚠️  Link '${name}' failed (${r.status}): ${r.text}`);
    else        console.log(`  ✅ Link: ${name}`);
}

await addLink('Chrome Extension (.zip)',  chromeUrl);
await addLink('Firefox Extension (.xpi)', firefoxUrl);
await addLink('Safari Extension (.zip)',  safariUrl);

console.log(`\n🎉 Done: https://gitlab.com/${PROJECT}/-/releases/${TAG}`);
