# Updates

The extension checks **GitHub Releases** for updates — the same place you
install from. There is no store listing, so updating the *extension package*
is always a manual reinstall; the *sidebar UI* can update itself (see below).

## Channels

Settings → *Appearance & App* → **Update channel**:

| Channel | Release followed | Version format |
| ------- | ---------------- | -------------- |
| **Stable** (default) | the latest `vX.Y.Z` release (`releases/latest`) | `1.7.0` |
| **Nightly** | the rolling [`nightly` pre-release](https://github.com/dasmatus/aipage/releases/tag/nightly) | `1.7.0.20261006` (`<base>.<YYYYMMDD>`) |

The setting is stored under the `update_channel` key (absent = `stable`).
Versions are compared component by component, so a nightly sorts above the
release it was built from and below the next release, and a later date is
newer. On the nightly channel two builds can share a version (a forced
rebuild on the same day): the check then compares the commit recorded in
the release's `nightly.json` with the installed one (Chrome exposes it via
`version_name`; Firefox/Safari do not, so there the check remembers the
last commit it notified about) and treats a different commit as an update —
once.

## Extension package

With **Auto-update** on, the background checks the channel's release every
hour through the unauthenticated GitHub API (one request per hour, far below
the 60/hour limit; a rate-limit answer is logged and retried next hour, a
missing release is ignored). When a newer package exists you get a
notification; clicking it (or *Download*) downloads the package for your
browser — `aipage-chrome.zip`, `aipage-firefox.xpi` or `aipage-safari.zip`
(any `aipage-safari*` asset) — which you then install as described in [Installation](installation.md).
**Check for updates now** next to the channel runs the same check on demand,
even with Auto-update off, and shows the result inline.

## Self-updating sidebar UI (GitHub bundle)

Every release also carries the hosted sidebar as `aipage-web.zip`, its hash
manifest `aipage-web.json` (`version`, git `sha`, `built_at`, and the
sha256/size of every file) and the individual files (`sidebar.html`,
`sidebar.<hash>.js`, `sidebar_bg.<hash>.wasm`, `sidebar_loader.<hash>.js`,
`sidebar.<hash>.css`, `tailwind.<hash>.css`). Settings → *Hosted UI* →
**Update the sidebar from GitHub releases (&lt;channel&gt;)** (off by default, key
`ui_bundle_update_enabled`) makes the background download the glue, wasm and
stylesheets of the channel's release — directly from the release assets, no
zip is unpacked — verify each file's sha256 against `aipage-web.json` and
store them in the extension's IndexedDB (database `aipage-ui-bundle`, store
`ui-bundle`: one record per file plus a `meta` record with version, commit,
channel and install time). The hourly check (and *Check for UI updates now*)
replaces the bundle when the release's `version` is higher, or equal with a
different commit, or when the channel changed; a bundle older than the
installed extension's own sidebar is never installed, and an existing one
that became older after an extension update is discarded. **Use bundled UI**
removes the download and switches the mode off; the card shows the installed
bundle's version, channel, commit and date.

When the bundled `sidebar.html` loads, its loader looks the bundle up before
importing the built-in files: the downloaded glue is imported as a `blob:`
module, the wasm is instantiated from the stored bytes and the stylesheets
are attached as `blob:` links. Any problem — missing or corrupt record,
hash mismatch, import or start-up error, timeout — is logged once, the
broken bundle is cleared and the built-in UI boots instead.

**Manifest V2 only.** Importing a downloaded module needs `blob:` in the
extension page's `script-src`, which MV2 allows. Manifest V3 forbids
remotely sourced code altogether, so an MV3 build of AIPage cannot offer
this mode; the Vercel-hosted UI (an iframe to a web origin) remains the
auto-updating option there.

## Which sidebar is used: precedence

1. **Hosted UI (Vercel)** — whenever *Remote UI (auto-updating)* is on; its
   own fallback on failure is the bundled page, which then continues with 2.
2. **GitHub-downloaded bundle** — when *Update the sidebar from GitHub
   releases* is on, a bundle is installed and its version is not older than
   the installed extension.
3. **Bundled files** — the sidebar shipped inside the extension package.

## Security notes

The bundle's files come from GitHub over TLS and are hash-checked against
`aipage-web.json`, which comes from the same release; the manifest's own
integrity rests on the release, so this trusts the repository's release
pipeline (GitHub Actions publishing `vX.Y.Z` tags and the nightly) exactly
the way installing the extension package does — no more. The downloaded UI
runs with the privileges of the bundled sidebar page (same origin, same
CSP), and nothing is executed from a release the background did not verify.
