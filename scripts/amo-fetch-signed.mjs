#!/usr/bin/env node
// Download the signed xpi of an existing (unlisted) version from
// addons.mozilla.org, for the case where `web-ext sign` refuses to re-submit
// a version string AMO already holds.
//
//   amo-fetch-signed.mjs <addon-id> <version> <output-xpi>
//
// Auth: WEB_EXT_API_KEY / WEB_EXT_API_SECRET (the same JWT credentials
// web-ext uses; https://mozilla.github.io/addons-server/topics/api/auth.html).
// Runs on node >= 18 and bun; depends on nothing outside the standard library.

import { createHmac, randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';

const AMO = process.env.AMO_API_BASE_URL ?? 'https://addons.mozilla.org/api/v5/';

const [addonId, version, output] = process.argv.slice(2);
if (!addonId || !version || !output) {
  console.error('usage: amo-fetch-signed.mjs <addon-id> <version> <output-xpi>');
  process.exit(2);
}
const key = process.env.WEB_EXT_API_KEY;
const secret = process.env.WEB_EXT_API_SECRET;
if (!key || !secret) {
  console.error('amo-fetch-signed: WEB_EXT_API_KEY / WEB_EXT_API_SECRET are required');
  process.exit(2);
}

/** AMO API JWT: HS256, issuer = API key, at most 5 minutes of validity. */
function jwt() {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const head = b64({ alg: 'HS256', typ: 'JWT' });
  const body = b64({ iss: key, jti: randomUUID(), iat: now, exp: now + 60 });
  const sig = createHmac('sha256', secret).update(`${head}.${body}`).digest('base64url');
  return `${head}.${body}.${sig}`;
}

async function api(path) {
  const url = new URL(path, AMO);
  const res = await fetch(url, { headers: { Authorization: `JWT ${jwt()}`, Accept: 'application/json' } });
  if (!res.ok) {
    throw new Error(`${url} -> HTTP ${res.status}: ${(await res.text()).slice(0, 500)}`);
  }
  return res.json();
}

/** Walk the (paginated) version list of the add-on, unlisted versions included. */
async function findVersion() {
  let next = `addons/addon/${encodeURIComponent(addonId)}/versions/?filter=all_with_unlisted&page_size=50`;
  while (next) {
    const page = await api(next);
    const hit = (page.results ?? []).find((v) => v.version === version);
    if (hit) return hit;
    next = page.next;
  }
  return undefined;
}

const v = await findVersion();
if (!v) {
  console.error(`amo-fetch-signed: version ${version} of ${addonId} not found on AMO`);
  process.exit(1);
}
const file = v.file ?? (Array.isArray(v.files) ? v.files[0] : undefined);
if (!file?.url) {
  console.error(`amo-fetch-signed: version ${version} has no downloadable file: ${JSON.stringify(v).slice(0, 500)}`);
  process.exit(1);
}
// `status` is "public" once AMO signed the file; "unreviewed"/"disabled"
// means signing did not happen (manual review, policy block) and the
// download would be unsigned or refused.
if (file.status && file.status !== 'public') {
  console.error(`amo-fetch-signed: version ${version} exists but its file status is "${file.status}" (not signed yet?)`);
  process.exit(1);
}
const res = await fetch(file.url, { headers: { Authorization: `JWT ${jwt()}` } });
if (!res.ok) {
  console.error(`amo-fetch-signed: download of ${file.url} failed: HTTP ${res.status}`);
  process.exit(1);
}
const bytes = Buffer.from(await res.arrayBuffer());
if (bytes.length < 4 || bytes.readUInt32LE(0) !== 0x04034b50) {
  console.error(`amo-fetch-signed: ${file.url} did not return a zip/xpi (${bytes.length} bytes)`);
  process.exit(1);
}
await writeFile(output, bytes);
console.log(`amo-fetch-signed: wrote ${output} (${bytes.length} bytes, AMO file ${file.id ?? '?'}, status ${file.status ?? '?'})`);
