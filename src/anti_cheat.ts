
(() => {
    // Override Visibility API
    Object.defineProperty(document, 'hidden', { get: () => false, configurable: true });
    Object.defineProperty(document, 'visibilityState', { get: () => 'visible', configurable: true });
    
    // Block events that report inactivity or switching
    const blockEvents = ['visibilitychange', 'webkitvisibilitychange', 'blur', 'focusout', 'pagehide', 'resize'];
    blockEvents.forEach(evt => {
        window.addEventListener(evt, e => e.stopImmediatePropagation(), true);
        document.addEventListener(evt, e => e.stopImmediatePropagation(), true);
    });

    // Block events used for copy/paste detection/prevention
    const cpEvents = ['copy', 'cut', 'paste', 'contextmenu'];
    cpEvents.forEach(evt => {
        window.addEventListener(evt, e => e.stopImmediatePropagation(), true);
        document.addEventListener(evt, e => e.stopImmediatePropagation(), true);
    });
    
    console.log('[AIPage] Anti-cheat active: Tab switch & Copy/Paste detection blocked (External Script).');
})();
