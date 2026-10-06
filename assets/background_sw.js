// EXPERIMENTAL — Manifest V3 service-worker bootstrap for the background WASM.
//
// Used only by the `chrome-mv3` xtask target (`manifest.chrome-mv3.json`).
// The MV2 builds keep `background_loader.js`. See docs/mv3-feasibility.md.
//
// A service worker has no `document`/`window` and is a *classic* worker, so
// the wasm-bindgen `--target no-modules` glue (`background.js`) is pulled in
// with `importScripts`; it defines the global `wasm_bindgen` init function,
// which fetches `background_bg.wasm` from the extension origin and
// instantiates it (`WebAssembly.instantiateStreaming`, allowed by the
// `'wasm-unsafe-eval'` extension-pages CSP — no `'unsafe-eval'` needed).
//
// Two service-worker rules the Rust code cannot satisfy by itself:
//
//  1. Listeners must be registered synchronously at top level, or the event
//     that woke the worker is dropped. The WASM registers its listeners only
//     after the (async) instantiation. So for every event the background
//     listens to we register a real listener *here*, synchronously, replace
//     the event's `addListener` with one that records the Rust handlers, and
//     buffer events until the WASM has booted, then replay them. For
//     `runtime.onMessage` the buffered `sendResponse` stays usable because
//     the early listener returns `true`.
//
//  2. A worker with no extension activity for 30 s is terminated, even with a
//     `fetch` in flight (the CORS proxy can wait on an LLM for longer than
//     that). While a message response is pending, an extension API is called
//     every 20 s, which resets the idle timer (the documented keepalive).
/* global wasm_bindgen */

(function () {
  "use strict";

  const TAG = "[AIPage sw]";
  const KEEPALIVE_MS = 20_000;
  // Give up keeping the worker alive for one message after this long.
  const KEEPALIVE_MAX_MS = 10 * 60_000;

  // --- keepalive while a `sendResponse` is pending -------------------------
  let pendingResponses = 0;
  let keepaliveTimer = null;
  function keepaliveStart() {
    pendingResponses += 1;
    if (keepaliveTimer !== null) return;
    keepaliveTimer = setInterval(() => {
      // Any extension API call resets the idle timer.
      chrome.runtime.getPlatformInfo(() => {});
    }, KEEPALIVE_MS);
  }
  function keepaliveStop() {
    pendingResponses = Math.max(0, pendingResponses - 1);
    if (pendingResponses === 0 && keepaliveTimer !== null) {
      clearInterval(keepaliveTimer);
      keepaliveTimer = null;
    }
  }
  function trackedSendResponse(sendResponse) {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      keepaliveStop();
    };
    keepaliveStart();
    const cap = setTimeout(finish, KEEPALIVE_MAX_MS);
    return (reply) => {
      clearTimeout(cap);
      finish();
      sendResponse(reply);
    };
  }

  // --- synchronous listener shim ------------------------------------------
  // Events the Rust background registers on (crates/aipage-background and
  // aipage-bindings). Anything not listed here is registered late and may
  // miss the event that woke the worker.
  const EVENTS = [
    ["runtime", "onMessage"],
    ["alarms", "onAlarm"],
    ["action", "onClicked"],
    ["notifications", "onClicked"],
    ["notifications", "onButtonClicked"],
  ];
  const flushers = [];

  function shim(ns, name) {
    const event = chrome[ns] && chrome[ns][name];
    if (!event) {
      console.warn(`${TAG} chrome.${ns}.${name} is not available; not shimmed`);
      return;
    }
    const isMessage = ns === "runtime" && name === "onMessage";
    const handlers = [];
    const queue = [];
    let ready = false;

    const dispatch = (args) => {
      if (isMessage && typeof args[2] === "function") args[2] = trackedSendResponse(args[2]);
      let keepOpen = false;
      for (const h of handlers) {
        try {
          if (h(...args) === true) keepOpen = true;
        } catch (e) {
          console.error(`${TAG} ${ns}.${name} handler threw`, e);
        }
      }
      return keepOpen;
    };

    // Real registration, synchronous, at top level.
    event.addListener((...args) => {
      if (ready) return dispatch(args);
      queue.push(args);
      return true; // keep the sendResponse channel open until replay
    });

    // What the WASM glue calls (`chrome.<ns>.<name>.addListener(cb)`).
    const record = (fn) => {
      handlers.push(fn);
    };
    try {
      Object.defineProperty(event, "addListener", { value: record, configurable: true, writable: true });
    } catch (e) {
      console.error(`${TAG} cannot shim chrome.${ns}.${name}.addListener; late registrations may miss events`, e);
      return;
    }

    flushers.push(() => {
      ready = true;
      for (const args of queue.splice(0)) dispatch(args);
    });
  }

  for (const [ns, name] of EVENTS) shim(ns, name);

  // --- boot the WASM -------------------------------------------------------
  importScripts("background.js");
  const url = chrome.runtime.getURL("background_bg.wasm");
  wasm_bindgen({ module_or_path: url })
    .then(() => {
      for (const flush of flushers) flush();
    })
    .catch((e) => console.error(`${TAG} background wasm init failed`, e));
})();
