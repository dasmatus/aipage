import browser from '../polyfills/browser-polyfill';

let antiCheatInjected = false;

export function injectAntiAntiCheat() {
    if (antiCheatInjected) return;
    const script = document.createElement('script');
    script.src = browser.runtime.getURL('anti_cheat.js');
    (document.head || document.documentElement).appendChild(script);
    script.onload = () => {
        script.remove();
    };
    antiCheatInjected = true;
}
