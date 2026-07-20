// Boots the background WASM module. `background.js` (wasm-bindgen --target
// no-modules) defines the global `wasm_bindgen` init function; we call it with
// the extension-relative path to the compiled module.
(function () {
  const api = typeof browser !== "undefined" ? browser : chrome;
  const url = api.runtime.getURL("background_bg.wasm");
  // eslint-disable-next-line no-undef
  wasm_bindgen({ module_or_path: url }).catch((e) =>
    console.error("[AIPage] background wasm init failed", e)
  );
})();
