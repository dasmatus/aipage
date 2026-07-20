// Boots the content WASM module inside the content-script isolated world.
// `content.js` (wasm-bindgen --target no-modules) defines the global
// `wasm_bindgen` init function; the compiled module must be fetched from the
// extension origin (it is listed in web_accessible_resources).
(function () {
  const api = typeof browser !== "undefined" ? browser : chrome;
  const url = api.runtime.getURL("content_bg.wasm");
  // eslint-disable-next-line no-undef
  wasm_bindgen({ module_or_path: url }).catch((e) =>
    console.error("[AIPage] content wasm init failed", e)
  );
})();
