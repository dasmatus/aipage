# Installation

To install the extension, download the latest build directly from our GitHub Releases (every pushed `v*` tag triggers the GitHub Actions release workflow, which builds all three targets and attaches them as release assets).

1.  Visit the [GitHub Releases](https://github.com/dasmatus/aipage/releases) page.
2.  Open the latest release.
3.  Download the asset for your browser:
    - **Chrome**: `aipage-chrome.zip`
    - **Firefox**: `aipage-firefox.xpi` (signed by addons.mozilla.org, installs permanently) — a release built without AMO credentials carries `aipage-firefox-unsigned.xpi` instead, which Firefox only loads as a temporary add-on
    - **Safari**: `aipage-safari-macos.zip` (the `AIPage.app` wrapper Safari needs, unsigned) — `aipage-safari.zip` is the bare web extension for wrapping it yourself with Xcode

## Chrome

1.  Download `aipage-chrome.zip` from the release.
2.  Unzip the file to a folder on your computer.
3.  Open Chrome and navigate to `chrome://extensions/`.
4.  Enable **"Developer mode"** (toggle in the top-right corner).
5.  Click **"Load unpacked"**.
6.  Select the unzipped folder.

> **Note on Manifest V2**: the extension is a Manifest V2 extension. Current Chrome/Chromium (153 and later) no longer loads MV2 extensions at all, not even unpacked: the `ExtensionManifestV2Disabled`/`ExtensionManifestV2Unsupported` features, `AllowLegacyMV2Extensions` and the `ExtensionManifestV2Availability` enterprise policy no longer exist in those builds. **Brave** (1.96, Chromium 154 base) still loads it: the real-install test passes there, and CI runs that test on both the latest stable Brave and Chromium 141. The Chrome build is only installable on Chromium builds up to the 141 era (started with `--disable-features=ExtensionManifestV2Disabled,ExtensionManifestV2Unsupported`) or on browsers that still allow MV2, such as **[Brave](https://brave.com/)**. An MV3 manifest for Chrome is the pending fix.

## Firefox

Release builds of Firefox only keep extensions that Mozilla has signed. The release workflow signs `aipage-firefox.xpi` through addons.mozilla.org's *self-distribution* (unlisted) channel — the add-on is not listed on AMO, but the file carries Mozilla's signature.

1.  Download `aipage-firefox.xpi` from the release.
2.  Open it in Firefox: drag it onto a Firefox window, or **File → Open File…**, or `about:addons` → gear icon → **Install Add-on From File…**.
3.  Confirm the **Add** prompt. The extension stays installed across restarts (Firefox 140 or newer; 142 on Android).

If the release only has `aipage-firefox-unsigned.xpi` (built without AMO credentials, e.g. from a fork), Firefox refuses to install it permanently. Load it as a temporary add-on instead: `about:debugging#/runtime/this-firefox` → **Load Temporary Add-on…** → pick the `.xpi`. Temporary add-ons are removed when Firefox exits. (Firefox Developer Edition / Nightly can install unsigned files permanently after setting `xpinstall.signatures.required` to `false` in `about:config`.)

## Safari (macOS only)

Safari does not load bare web extensions: they must ship inside a native macOS app. The release's `aipage-safari-macos.zip` contains that app (`AIPage.app`), built by Apple's `safari-web-extension-packager` on a macOS runner from the same files as the other packages. It is **not code-signed or notarized** (that needs an Apple Developer account), so Safari treats it as a developer build:

1.  Download `aipage-safari-macos.zip` from the release and unzip it; move `AIPage.app` to *Applications* (or anywhere permanent — Safari remembers the location).
2.  Open the app once: right-click (Control-click) `AIPage.app` → **Open** → **Open** again in the Gatekeeper dialog (a plain double-click is refused for unsigned apps). The app window only tells you to enable the extension; you can close it afterwards.
3.  In Safari, allow unsigned extensions: **Safari → Settings → Advanced** → tick **Show features for web developers** (Safari 16 and earlier: *Show Develop menu in menu bar*), then **Settings → Developer** → tick **Allow unsigned extensions** (Safari 16 and earlier: **Develop → Allow Unsigned Extensions**). Safari resets this switch every time it quits — set it again after a restart or the extension stays disabled.
4.  **Safari → Settings → Extensions** → enable **AIPage** and grant it access to `edupage.org` when asked.

`aipage-safari.zip` is the bare web-extension folder. Use it to build the wrapper yourself with Xcode (`scripts/setup-safari.sh`, see [Packaging for Distribution](packaging.md#packaging-for-distribution)), for example to sign it with your own developer certificate.

## Nightly builds

Every night (and on demand) the head of `main` is built for all three browsers and published to a single rolling pre-release:

**<https://github.com/dasmatus/aipage/releases/tag/nightly>**

- The release is re-created in place: the `nightly` tag moves to the built commit, the assets (`aipage-chrome.zip`, `aipage-firefox.xpi` or `aipage-firefox-unsigned.xpi`, `aipage-safari.zip`, `aipage-safari-macos.zip`, plus the hosted sidebar bundle `aipage-web.zip` / `aipage-web.json` and its individual files, see [Updates](updates.md)) are replaced, and the notes list the commits since the previous nightly. `nightly.json` records the exact commit the assets were built from, the asset names and whether the Firefox xpi was signed (`firefox_signed`).
- The manifest version is stamped as `<base>.<YYYYMMDD>` (for example `1.7.0.20261006`), so a nightly sorts above the release it is based on and below the next release. Chrome additionally shows the human-readable `version_name` (`1.7.0-nightly.20261006+<sha>`).
- Nothing is published when `main` has not changed since the last nightly, and a nightly whose extension install tests fail is never published.
- Nightlies are development builds of whatever is on `main` — including half-finished features. The Chrome and Safari packages are unsigned (unpacked install / unsigned-extension mode); the Firefox xpi is signed by AMO like a release when the repository has the AMO credentials configured (see [Firefox signing (AMO)](packaging.md#firefox-signing-amo)), each nightly being its own AMO version.

### Installing a nightly

**Chrome / Chromium / Brave** — unzip `aipage-chrome.zip`, open `chrome://extensions/`, enable **Developer mode** and **Load unpacked** the folder. Chromium 153 and later refuse to load Manifest V2 extensions entirely (the MV2 feature flags and policy are gone from those builds). On a Chromium build up to the 141 era start the browser with

```
--disable-features=ExtensionManifestV2Disabled,ExtensionManifestV2Unsupported
```

(or enable the `AllowLegacyMV2Extensions` feature, exposed as *Allow legacy extension manifest versions* in `chrome://flags` on builds that still have it). This is exactly what the install tests do in CI, pinned to Chrome 141; Brave keeps MV2 support without any flag.

**Firefox** — `aipage-firefox.xpi` is AMO-signed: open it in Firefox and confirm **Add**; it installs permanently and each night's build is a higher version than the last, so opening the next nightly upgrades in place. When the nightly only offers `aipage-firefox-unsigned.xpi`, open `about:debugging#/runtime/this-firefox`, choose **Load Temporary Add-on…** and pick the file (removed when Firefox exits).

**Safari (macOS)** — unzip `aipage-safari-macos.zip`, open `AIPage.app` once (right-click → **Open**, it is unsigned), switch on **Allow unsigned extensions** in Safari's Developer settings and enable AIPage under **Settings → Extensions**, exactly as for a [release](#safari-macos-only). `aipage-safari.zip` is the bare extension for wrapping it yourself with `scripts/setup-safari.sh`. Safari cannot run on Linux: the Linux job checks the Safari dist structurally and the macOS job proves that Apple's packager and `xcodebuild` accept it, but nobody clicks through the extension before it is published.
