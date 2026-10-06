#!/usr/bin/env bash
# Sign the Firefox build through addons.mozilla.org (AMO) for self-distribution
# and leave the result at the canonical asset name.
#
#   scripts/sign-firefox.sh [<source-dir>] [<output-xpi>]
#       source-dir  built Firefox dist (default: dist-firefox)
#       output-xpi  where the signed xpi goes (default: aipage-firefox.xpi)
#
# Credentials come from WEB_EXT_API_KEY / WEB_EXT_API_SECRET (an AMO API key
# pair from https://addons.mozilla.org/developers/addon/api/key/). When either
# is empty the script does nothing and exits 0, so forks and pull requests
# build without secrets; CI then ships the unsigned xpi under a different
# name (aipage-firefox-unsigned.xpi).
#
# `web-ext sign --channel unlisted` uploads the extension, waits for AMO's
# validation + automatic signing, and downloads the signed file. AMO keeps
# one immutable file per (add-on id, version): submitting a version string
# that already exists is rejected with "Version <v> already exists". That is
# normal for a nightly rebuilt on the same day (the version is stamped
# <base>.<YYYYMMDD>) or a re-run release workflow, so in that case the already
# signed file of that version is fetched instead (scripts/amo-fetch-signed.mjs).
#
# Exit codes: 0 signed (or skipped for lack of credentials); 1 otherwise.
set -euo pipefail

source_dir="${1:-dist-firefox}"
output="${2:-aipage-firefox.xpi}"
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ -z "${WEB_EXT_API_KEY:-}" ] || [ -z "${WEB_EXT_API_SECRET:-}" ]; then
  echo "sign-firefox: WEB_EXT_API_KEY / WEB_EXT_API_SECRET not set; skipping AMO signing" >&2
  exit 0
fi
if [ ! -f "$source_dir/manifest.json" ]; then
  echo "sign-firefox: $source_dir/manifest.json not found (build the firefox target first)" >&2
  exit 1
fi

addon_id="$(jq -r '.browser_specific_settings.gecko.id // empty' "$source_dir/manifest.json")"
version="$(jq -r '.version' "$source_dir/manifest.json")"
if [ -z "$addon_id" ]; then
  echo "sign-firefox: manifest has no browser_specific_settings.gecko.id; AMO needs a stable id" >&2
  exit 1
fi
echo "sign-firefox: signing $addon_id version $version (channel: unlisted)"

artifacts="$(mktemp -d)"
log="$artifacts/web-ext-sign.log"
trap 'rm -rf "$artifacts"' EXIT

set +e
# --api-key/--api-secret are read from the WEB_EXT_API_* environment by
# web-ext itself; they are not passed on the command line so they never show
# up in a process listing. AMO signs unlisted versions automatically once
# validation passes; allow up to 15 minutes for that.
bunx web-ext sign \
  --source-dir "$source_dir" \
  --artifacts-dir "$artifacts" \
  --channel unlisted \
  --no-input \
  --timeout 900000 \
  --approval-timeout 900000 \
  2>&1 | tee "$log"
status=${PIPESTATUS[0]}
set -e

if [ "$status" -eq 0 ]; then
  signed="$(find "$artifacts" -maxdepth 1 -name '*.xpi' -print -quit)"
  if [ -z "$signed" ]; then
    echo "sign-firefox: web-ext sign succeeded but produced no .xpi in $artifacts" >&2
    exit 1
  fi
  cp "$signed" "$output"
  echo "sign-firefox: signed xpi written to $output ($(basename "$signed"))"
  exit 0
fi

if grep -qiE 'version[^\n]*already exists|already exists' "$log"; then
  echo "sign-firefox: AMO already has version $version of $addon_id (same-day re-run?); fetching the signed file it holds"
  bun "$here/amo-fetch-signed.mjs" "$addon_id" "$version" "$output"
  echo "sign-firefox: previously signed xpi written to $output"
  exit 0
fi

echo "sign-firefox: web-ext sign failed (exit $status); see the log above" >&2
exit 1
