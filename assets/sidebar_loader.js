// External ES-module bootstrap for the sidebar WASM.
//
// The MV2 extension CSP (`script-src 'self' ...`) blocks inline scripts —
// `'unsafe-inline'` is ignored in extension CSP for security — so the
// wasm-bindgen (`--target web`) entry must be loaded from a same-origin file
// rather than an inline `<script>`. `#[wasm_bindgen(start)]` runs on init.
import init from "./sidebar.js";
init();
