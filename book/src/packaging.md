# Packaging, CI & Deployment

How the release packages are built and signed, what the GitHub Actions workflows do and how the hosted sidebar and this book are deployed. For building and testing locally see the [contributing guide](contributing.md).

## Packaging for Distribution

```bash
bun run package:chrome        # aipage-chrome.zip
bun run package:firefox       # packages/*.zip (web-ext; the unsigned Firefox xpi)
bun run sign:firefox          # aipage-firefox.xpi signed by AMO (needs WEB_EXT_API_KEY/SECRET, see below)
bun run package:safari        # aipage-safari.zip (the bare web extension)
bun run package:safari:app    # aipage-safari-macos.zip: AIPage.app built unsigned with Xcode (macOS only)
```

`scripts/setup-safari.sh` on its own only generates `safari/AIPage/AIPage.xcodeproj` (open it in Xcode to sign with your own certificate or to debug); `--build` adds the unsigned Release build, `--package <zip>` also zips `AIPage.app`. It uses `xcrun safari-web-extension-packager` (Xcode 26+) or `safari-web-extension-converter` (older Xcode), with `--macos-only --copy-resources --no-prompt --force`. The packager prints a warning about manifest keys Safari does not support (`downloads`, `notifications` buttons, …); that is expected and does not stop the build.

## CI/CD Pipeline

This project uses [GitHub Actions](https://github.com/dasmatus/aipage/tree/main/.github/workflows) (see `.github/workflows/`) with build/test steps running inside the pinned [Nix flake](https://github.com/dasmatus/aipage/blob/main/flake.nix) devShell:

- **Check job**: `cargo clippy` (with `-D warnings`) + `cargo test --workspace`
- **Agent server job**: `bun test` + `tsc --noEmit` for `agent-server/`
- **Build workflow** (`build.yml`, reusable): on Ubuntu, `cargo run -p xtask -- build-all` (Chrome, Firefox, Safari) and `build --target web`, packages `aipage-chrome.zip`, `aipage-safari.zip`, the Firefox `.xpi`, `aipage-web.zip` and `aipage-web.json` (plus the individual web files), then runs the **extension install tests** (`bun run test:install`: a real unpacked MV2 install in headless Chromium — including booting the `dist-web` bundle from IndexedDB through `blob:` imports —, `web-ext lint` + a temporary install in headless Firefox that boots the background and sidebar WASM over the remote debugging protocol, a structural check of the Safari dist and of `aipage-web.json` against `dist-web`). A failing install test fails the job. With `sign-firefox: true` the xpi is then signed through AMO (below); otherwise it is uploaded as `aipage-firefox-unsigned.xpi`. A second, **macOS** job downloads the Ubuntu-built `dist-safari`, runs `scripts/setup-safari.sh --package aipage-safari-macos.zip` (Apple's packager + unsigned `xcodebuild`) and uploads the app as its own artifact (`<artifact-name>-safari-macos`); it is marked `continue-on-error`, so a converter/Xcode breakage shows as a red job and a missing asset rather than blocking the other packages. Accepts an optional manifest version stamp.
- **E2e job** (best-effort): Playwright against the built Chrome dist served over HTTP
- **Release workflow**: on a pushed `v*` tag, runs the build workflow (signing on) and publishes a GitHub Release with `aipage-chrome.zip`, `aipage-firefox.xpi` (or `-unsigned`), `aipage-safari.zip` and, when the macOS job succeeded, `aipage-safari-macos.zip`, plus the sidebar bundle (`aipage-web.zip`, `aipage-web.json` and its files); the extension's update check reads these releases
- **Nightly workflow**: daily cron / manual; skips when `main` is unchanged, otherwise builds with a `<base>.<YYYYMMDD>` version stamp, runs the install tests, signs the Firefox xpi and updates the rolling [`nightly` pre-release](https://github.com/dasmatus/aipage/releases/tag/nightly) (the *Nightly* update channel)

## Firefox signing (AMO)

Release builds of Firefox install only Mozilla-signed extensions, so `build.yml` runs `scripts/sign-firefox.sh` (`web-ext sign --channel unlisted`) for nightlies and releases: it uploads `dist-firefox` to addons.mozilla.org's **self-distribution** channel, waits for the automatic validation + signing (up to 15 minutes), downloads the signed file and ships it as `aipage-firefox.xpi`. The add-on never appears in the public AMO listing; it is identified by the `browser_specific_settings.gecko.id` in `assets/manifest.firefox.json` (`edupage-ai-sidebar@hesburger.dev`), which is also why that manifest declares `data_collection_permissions` — AMO rejects new submissions without it.

The **repository owner must add two secrets** (Settings → Secrets and variables → Actions):

| Secret               | Value                                                                                                                      |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `WEB_EXT_API_KEY`    | The *JWT issuer* of an AMO API key, created at <https://addons.mozilla.org/developers/addon/api/key/> (looks like `user:12345678:123`) |
| `WEB_EXT_API_SECRET` | The *JWT secret* shown together with the issuer (only once, at creation)                                                   |

The account that owns the key becomes the add-on's developer on AMO; the first signed upload creates the (unlisted) add-on there. Without the secrets — forks, pull requests, a fresh clone — the workflow prints a notice and ships the unsigned xpi under the name `aipage-firefox-unsigned.xpi`, so nothing breaks; `ci.yml` never signs because AMO accepts each version string only once and plain CI builds all carry the committed version.

**"Version already exists"**: AMO keeps exactly one immutable file per add-on version. A nightly rebuilt on the same day (same `<base>.<YYYYMMDD>` stamp) or a re-run release workflow would be refused with `Version 1.7.0.20261006 already exists`; `scripts/sign-firefox.sh` recognises that and downloads the file AMO already signed for that version (`scripts/amo-fetch-signed.mjs`, same credentials) instead of failing. To re-sign changed code under the same version you must first delete that version on AMO (Developer Hub → the add-on → *Manage Status & Versions*), or bump the version. If signing fails for any other reason the job fails rather than silently publishing an unsigned file.

Locally the same script works with the two variables exported: `WEB_EXT_API_KEY=… WEB_EXT_API_SECRET=… bun run sign:firefox`.

## Deploying the hosted UI and the docs

```bash
cargo run -p xtask -- build --target web   # → dist-web/ (hashed js/wasm/css + vercel.json)
```

`.github/workflows/deploy-web.yml` runs that build in the Nix devShell on
every push to `main` that touches the sidebar/core/bindings/assets/xtask (and
on manual dispatch), then deploys the prebuilt directory to production with
`vercel deploy dist-web --prod --yes`. The documentation book is deployed the
same way by `.github/workflows/deploy-docs.yml` (`mdbook build` → `book/book/`,
`vercel deploy book/book --prod --yes`) to <https://aipage-docs.vercel.app>.
The Vercel team/project ids are plain `env` values in the workflows; the
**repository owner must add one secret**, shared by both workflows:

| Secret / id         | Value                                                                 |
| ------------------- | --------------------------------------------------------------------- |
| `VERCEL_TOKEN`      | Secret: a Vercel access token (Account Settings → Tokens) with access to the `dasmatus-personal` team |
| `VERCEL_ORG_ID`     | `team_7Z3rZakz7VA0GFsobgGCSMBN` (team `dasmatus-personal`; workflow `env`, not a secret) |
| `VERCEL_PROJECT_ID` | `prj_ItmdNa5y83DzyeCRFgm9iarKmoDZ` for the hosted UI (project `aipage`, `deploy-web.yml`); `prj_ykFsBQO6a0zZT1EmzkaQ4KXuH0U7` for the docs (project `aipage-docs`, `deploy-docs.yml`) |

`dist-web/vercel.json` (copied from `assets/vercel.json`) sets
`application/wasm`, immutable caching for the content-hashed files,
`no-cache` for `sidebar.html`, and the CSP described in [Hosted UI](hosted-ui.md). If the production
domain ever changes, update `DEFAULT_REMOTE_UI_URL` and ship a new extension
build (or set the custom URL in settings in the meantime).
