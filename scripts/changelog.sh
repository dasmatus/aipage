#!/usr/bin/env bash
# Regenerate the changelog, or print the notes of one release, with git-cliff.
#
#   scripts/changelog.sh                   # rewrite book/src/changelog.md
#   scripts/changelog.sh --release vX.Y.Z  # print that release's section (release.yml)
#
# book/src/changelog.md (CHANGELOG.md is a symlink to it) is generated from the
# conventional commit history — never edit it by hand. CI regenerates it on
# every push to main (.github/workflows/changelog.yml); `bun run changelog`
# runs this script locally for a preview. The format lives in cliff.toml.
#
# The generated part starts after the commit that released 1.5.0: the older
# releases were produced by standard-version before the move to GitHub and are
# frozen verbatim in cliff.toml's footer. git-cliff has no configuration key
# for a start commit, so that boundary lives here and is passed as the commit
# range; everything older is covered by the frozen sections.
set -euo pipefail
cd "$(dirname "$0")/.."

# `chore(release): 1.5.0` — the last release described by the frozen history.
SINCE=34c5b389c8eb22c49dd93adbc5f0e99581f6f7d3
OUT=book/src/changelog.md

if ! git cat-file -e "${SINCE}^{commit}" 2>/dev/null; then
  echo "error: commit ${SINCE} is not in this clone (shallow checkout?); fetch the full history first" >&2
  exit 1
fi

case "${1:-}" in
  "")
    git cliff "${SINCE}..HEAD" --output "${OUT}"
    ;;
  --release)
    tag="${2:?usage: $0 --release vX.Y.Z}"
    # The notes cover the commits since the previous release tag, or since
    # 1.5.0 for the first tagged release. (`--current` would start at the
    # repository root for a first tag and ignores an explicit range.)
    prev="$(git describe --tags --abbrev=0 --match 'v[0-9]*' "${tag}^" 2>/dev/null || true)"
    git cliff "${prev:-${SINCE}}..${tag}" --strip all
    ;;
  *)
    echo "usage: $0 [--release vX.Y.Z]" >&2
    exit 2
    ;;
esac
