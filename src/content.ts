import browser from "./polyfills/browser-polyfill";
import { SidebarController } from './content-scripts/sidebar-controller';
import { applyGlobalOverrides } from './content-scripts/theme-manager';
import { injectAntiAntiCheat } from './content-scripts/anti-cheat-injector';

// Inject AI Button and Manage Sidebar Iframe
(function () {
    // 0. Extended Singleton guard and top-window check
    if ((window as any).__gemini_sidebar_injected__) return;
    if (window !== window.top) return;
    (window as any).__gemini_sidebar_injected__ = true;

    console.log('[AIPage] Content script loaded and active');

    const sidebar = new SidebarController();
    let observer: MutationObserver | null = null;
    let antiCheatCheckDone = false;

    // Helper for robust storage access using Promise-based webextension-polyfill API
    function getStorage(keys: string[]): Promise<any> {
        return browser.storage.local.get(keys);
    }

    function sync() {
        const quickMenu = document.querySelector('.edubarQuickmenu') as HTMLElement;
        const testMenu = document.querySelector('.etest-player-header-inner .etest-header-nav:last-child') as HTMLElement;

        if (!quickMenu && !testMenu) return;

        const isTest = testMenu && testMenu.offsetHeight > 0;
        const container = isTest ? testMenu! : quickMenu!;

        if (isTest && !antiCheatCheckDone) {
            injectAntiAntiCheat();
            antiCheatCheckDone = true;
        }

        // If container is not visible, skip
        if (container.offsetWidth === 0 && container.offsetHeight === 0) return;

        const btnClass = isTest
            ? 'etest-action-button interactiveElem'
            : 'edubarChatBtn qbutton qbutton-normal tips-bottom';

        let btn = document.getElementById('edubar-ai-btn');
        if (btn) {
            if (btn.parentElement === container && btn.className === btnClass) {
                if (container.firstChild !== btn) container.insertBefore(btn, container.firstChild);
                return;
            }
            btn.remove();
        }

        btn = document.createElement('a');
        btn.id = 'edubar-ai-btn';
        btn.className = btnClass;
        btn.style.cursor = 'pointer';
        btn.style.display = 'inline-flex';
        btn.style.alignItems = 'center';
        btn.style.justifyContent = 'center';
        btn.style.gap = '6px';
        btn.setAttribute('title', 'AI A');

        btn.innerHTML = `
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
            </svg>
            <p style="margin: 0;">AI</p>
        `;


        container.insertBefore(btn, container.firstChild);
        btn.addEventListener('click', onAiButtonClick);

        if (sidebar.isOpen) sidebar.updateLayout(sidebar.currentWidth);
    }

    function onAiButtonClick(e: MouseEvent) {
        e.preventDefault();
        e.stopPropagation();
        sidebar.toggle();
    }

    async function init() {
        console.log('[AIPage] Initializing...');

        // Load settings first (await makes it synchronous-like)
        const result = await getStorage(['sidebarWidth', 'ai_sidebar_theme', 'ai_sidebar_global']);
        if (result.sidebarWidth) sidebar.currentWidth = result.sidebarWidth;
        const globalThemeEnabled = !!result.ai_sidebar_global;

        // Cleanup stale elements from previous context
        sidebar.cleanup();
        document.getElementById('edubar-ai-btn')?.remove(); // Remove button to reset event listeners

        sync();

        if (observer) observer.disconnect();
        observer = new MutationObserver(() => sync());
        // Observing body style changes might be too aggressive, but kept for compatibility
        observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class'] });

        applyGlobalOverrides(result.ai_sidebar_theme || 'default', globalThemeEnabled);

        // Listen for theme changes from storage
        browser.storage.onChanged.addListener((changes) => {
            if (changes.ai_sidebar_theme || changes.ai_sidebar_global) {
                // We need both current values to update correctly
                getStorage(['ai_sidebar_theme', 'ai_sidebar_global']).then((res) => {
                    applyGlobalOverrides(res.ai_sidebar_theme || 'default', !!res.ai_sidebar_global);
                });
            }
        });
    }

    browser.runtime.onMessage.addListener((msg: any, sender: any): Promise<any> | void => {
        if (msg.action === 'toggle_sidebar') {
            sidebar.toggle();
            return Promise.resolve();
        } 
        
        if (msg.action === 'get_page_content') {
            return (async () => {
                try {
                    // Prioritize selection
                    const selection = window.getSelection();
                    const selectionText = selection?.toString().trim();

                    if (selectionText) {
                        return { content: selectionText, isSelection: true };
                    }

                    // Prioritize test content if in test player
                    const testContent = document.querySelector('.etest-player-content') as HTMLElement;
                    let text = '';
                    
                    if (testContent && testContent.offsetParent) { 
                        text = testContent.innerText;
                    } else {
                        // Clone body to manipulate without affecting page
                        const clone = document.body.cloneNode(true) as HTMLElement;
                        
                        // Remove known non-content elements to reduce noise
                        const selectorsToRemove = [
                            '#gemini-sidebar-frame', 
                            '#gemini-sidebar-resizer', 
                            '.edubar', 
                            '#edubarHeader',
                            'script',
                            'style',
                            'noscript',
                            'iframe'
                        ];
                        
                        selectorsToRemove.forEach(sel => {
                            const els = clone.querySelectorAll(sel);
                            els.forEach(el => el.remove());
                        });

                        text = clone.innerText;
                    }
                    
                    // Cleanup whitespace and limit length
                    text = text.replace(/\s+/g, ' ').trim();
                    // Cap at ~15k chars to fit reasonable context windows
                    if (text.length > 15000) text = text.substring(0, 15000);
                    
                    return { content: text, isSelection: false };
                } catch (e) {
                    console.error('[AIPage] Content scan failed:', e);
                    return { content: null, error: (e as Error).toString() };
                }
            })();
        }
    });

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
