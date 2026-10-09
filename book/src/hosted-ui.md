# Hosted UI

The sidebar's user interface (the Leptos/WASM app in `sidebar.html`) is also
published as a static site on Vercel. By default the extension loads the
sidebar **from that hosted copy**, so UI fixes and features ship the moment
they are deployed — without reinstalling or updating the extension. The
extension itself (content script, background CORS proxy, manifests) is still
the installed package; only the panel's UI is remote.

- **Default: on.** Settings → *Hosted UI* → *Remote UI (auto-updating)*.
  Turning it off makes the extension use the sidebar bundled with the install;
  the sidebar reloads immediately. The setting is stored under the
  `remote_ui_enabled` key (absent = on).
- **Custom URL (advanced).** The same card has a *Custom UI URL* field
  (`remote_ui_url`). Only `https://` origins are accepted (plus
  `http://localhost` for development); leave it empty to use the default,
  which is the `DEFAULT_REMOTE_UI_URL` constant in
  `crates/aipage-core/src/remote_ui.rs` (`https://aipage-sooty.vercel.app`).
- **Fallback.** The content script points the sidebar iframe at
  `<hosted>/sidebar.html` and waits for the hosted page to connect over the
  bridge. If that does not happen within 8 seconds (offline, host unreachable,
  the page blocked by a CSP, the WASM failing to boot) or the frame reports an
  error, the iframe is switched to the bundled `sidebar.html`. You never end
  up with an empty panel; a warning is logged in the page console
  (`[AIPage] hosted sidebar unavailable (…)`).
- **How it talks to the extension.** A web page has no `chrome.*` APIs, so the
  hosted sidebar detects that at startup and uses a `postMessage` bridge
  instead (`aipage-bindings::bridge`): it says `hello` to its parent window,
  the content script answers with a private `MessageChannel` port, and the
  five extension calls the sidebar uses (`runtime.sendMessage`,
  `storage.local.get/set`, `storage.onChanged`, `tabs.query/sendMessage`) are
  relayed over that port. The content script answers `tabs.*` for its own tab
  only — it never touches `chrome.tabs`.
- **Security model.** The content script accepts the handshake only when the
  message's `origin` is exactly the configured hosted-UI origin *and* its
  `source` is the sidebar iframe's own window; the reply is posted with that
  origin as `targetOrigin`. After the handshake all traffic runs over a
  transferred `MessagePort`, which scripts of the EduPage page cannot observe.
  The hosted page sends `Content-Security-Policy: frame-ancestors
  https://*.edupage.org`, so only EduPage pages may embed it, plus a strict
  CSP for its own resources. The hosted UI gets exactly the privileges the
  bundled sidebar has and nothing more; no new host permissions were added to
  the manifests. What changes versus the bundled sidebar: you trust the Vercel
  deployment (its content comes from this repository's `main` branch via
  GitHub Actions) and, as with any iframe inside EduPage, a script running in
  the EduPage page could show its own copy of the UI — it still could not read
  your settings or API keys from the extension.

How the hosted copy is built and deployed is described in [Packaging, CI & Deployment](packaging.md#deploying-the-hosted-ui-and-the-docs).
