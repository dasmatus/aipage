// Inject AI Button and Manage Sidebar Iframe
(function () {
    // 0. Extended Singleton guard and top-window check
    if ((window as any).__gemini_sidebar_injected__) return;
    if (window !== window.top) return;
    (window as any).__gemini_sidebar_injected__ = true;

    console.log('[Gemini Sidebar] Content script loaded and active');

    let sidebarOpen = false;
    let iframe: HTMLIFrameElement | null = null;
    let resizer: HTMLDivElement | null = null;
    let currentSidebarWidth = 260;
    let isResizing = false;

    const NAVBAR_ID = 'edubar';
    const TEST_PLAYER_HEADER_CLASS = '.etest-player-header';
    let antiCheatInjected = false;

    let observer: MutationObserver | null = null;

    // Helper for robust storage access (handles both callback and promise versions for test/real environments)
    function getStorage(keys: string[]): Promise<any> {
        return new Promise((resolve) => {
            const promise = (chrome.storage.local.get as any)(keys, (result: any) => {
                if (result) resolve(result);
            });
            // Handle Manifest V3 Promise return
            if (promise && promise.then) {
                promise.then(resolve);
            }
        });
    }

    function sync() {
        const quickMenu = document.querySelector('.edubarQuickmenu') as HTMLElement;
        const testMenu = document.querySelector('.etest-player-header-inner .etest-header-nav:last-child') as HTMLElement;

        if (!quickMenu && !testMenu) return;

        const isTest = testMenu && testMenu.offsetHeight > 0;
        const container = isTest ? testMenu! : quickMenu!;

        if (isTest && !antiCheatInjected) {
            injectAntiCheat();
            antiCheatInjected = true;
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
        btn.setAttribute('title', 'AI Asistent');

        btn.innerHTML = `
            <p style="margin: 0;">AI</p>
        `;

        container.insertBefore(btn, container.firstChild);
        btn.addEventListener('click', onAiButtonClick);

        if (sidebarOpen) updateLayout(currentSidebarWidth);
    }

    function onAiButtonClick(e: MouseEvent) {
        e.preventDefault();
        e.stopPropagation();
        toggleSidebar();
    }

    const THEME_MAP: Record<string, { accent: string; text: string }> = {
        'default': { accent: '#2e7d32', text: '#ffffff' },
        'sms': { accent: '#007aff', text: '#ffffff' },
        'gradient': { accent: '#f81ce5', text: '#ffffff' },
        'discord': { accent: '#5865f2', text: '#ffffff' },
        'tokyo': { accent: '#7aa2f7', text: '#ffffff' },
        'mono': { accent: '#000000', text: '#ffffff' }
    };

    function injectAntiCheat() {
        console.log('[Gemini Sidebar] Injecting anti-cheat protection');
        const script = document.createElement('script');
        script.textContent = `
            (() => {
                // Override Visibility API
                Object.defineProperty(document, 'hidden', { get: () => false, configurable: true });
                Object.defineProperty(document, 'visibilityState', { get: () => 'visible', configurable: true });
                
                // Block events that report inactivity or switching
                const blockEvents = ['visibilitychange', 'webkitvisibilitychange', 'blur', 'focusout', 'pagehide'];
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
                
                console.log('[EduPage AI] Anti-cheat active: Tab switch & Copy/Paste detection blocked.');
            })();
        `;
        (document.head || document.documentElement).appendChild(script);
        script.remove();
    }

    async function init() {
        console.log('[Gemini Sidebar] Initializing...');

        // Load settings first (await makes it synchronous-like)
        const result = await getStorage(['sidebarWidth', 'ai_sidebar_theme']);
        if (result.sidebarWidth) currentSidebarWidth = result.sidebarWidth;

        // Cleanup stale elements
        document.getElementById('gemini-sidebar-frame')?.remove();
        document.getElementById('gemini-sidebar-resizer')?.remove();

        iframe = null;
        resizer = null;
        sidebarOpen = false;

        sync();

        if (observer) observer.disconnect();
        observer = new MutationObserver(() => sync());
        observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class'] });

        applyGlobalOverrides(result.ai_sidebar_theme || 'default');

        // Listen for theme changes from storage
        chrome.storage.onChanged.addListener((changes) => {
            if (changes.ai_sidebar_theme) {
                applyGlobalOverrides(changes.ai_sidebar_theme.newValue);
            }
        });
    }

    function applyGlobalOverrides(theme: string = 'default') {
        const styleId = 'edupage-ai-overrides';
        let style = document.getElementById(styleId) as HTMLStyleElement;
        if (!style) {
            style = document.createElement('style');
            style.id = styleId;
            document.head.appendChild(style);
        }

        const colors = THEME_MAP[theme] || THEME_MAP['default'];

        style.textContent = `
            #edubarHeader { border-bottom: 1px solid #e0e0e0 !important; box-shadow: 0 1px 3px rgba(0,0,0,0.05) !important; }
            .edubarHeader .edubarHeaderInner { background: #ffffff !important; }
            #edubar-ai-btn { transition: transform 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275); }
            #edubar-ai-btn:hover { transform: scale(1.1); }
            ::selection { background-color: ${colors.accent} !important; color: ${colors.text} !important; }
            
            /* Prevent test player header from moving/shrinking */
            .etest-player-header, .etest-player-header-inner {
                width: 100vw !important;
                right: 0 !important;
                left: 0 !important;
                max-width: none !important;
            }
        `;
    }

    function getNavbarHeight(): number {
        const testHeader = document.querySelector(TEST_PLAYER_HEADER_CLASS) as HTMLElement;
        if (testHeader && testHeader.offsetHeight > 0) return testHeader.offsetHeight;
        const navbar = document.getElementById(NAVBAR_ID);
        if (navbar && navbar.offsetHeight > 0) return navbar.offsetHeight;
        return 43;
    }

    function toggleSidebar() {
        sidebarOpen = !sidebarOpen;
        if (sidebarOpen) openSidebar();
        else closeSidebar();
    }

    function openSidebar() {
        if (!iframe) createSidebarElements();
        const navbarHeight = getNavbarHeight();
        const topOffset = `${navbarHeight}px`;
        const heightCalc = `calc(100vh - ${navbarHeight}px)`;

        if (iframe) {
            iframe.style.top = topOffset;
            iframe.style.height = heightCalc;
            iframe.style.width = `${currentSidebarWidth}px`;
            iframe.style.right = '0px';
            iframe.style.display = 'block';
        }
        if (resizer) {
            resizer.style.top = topOffset;
            resizer.style.height = heightCalc;
            resizer.style.right = `${currentSidebarWidth}px`;
            resizer.style.display = 'block';
        }
        updateLayout(currentSidebarWidth);
    }

    function closeSidebar() {
        if (iframe) iframe.style.right = `-${currentSidebarWidth}px`;
        if (resizer) resizer.style.display = 'none';
        updateLayout(0);
    }

    function updateLayout(width: number) {
        const widthCalc = width > 0 ? `calc(100% - ${width}px)` : '100%';
        const rightOffset = width > 0 ? `${width}px` : '0px';

        document.body.style.width = widthCalc;
        document.body.style.position = 'relative';
        document.body.style.transition = isResizing ? 'none' : 'width 0.3s ease';

        const navbar = document.getElementById(NAVBAR_ID);
        if (navbar) {
            navbar.style.width = widthCalc;
            navbar.style.transition = isResizing ? 'none' : 'width 0.3s ease';
        }

        // Removed extended header manipulation to prevent navbar moving
        // const etestFixedHeaders = document.querySelectorAll('.etest-player-header.fixedRight, .etest-player-header-inner') as NodeListOf<HTMLElement>;
        // etestFixedHeaders.forEach(el => {
        //     el.style.right = rightOffset;
        //     el.style.width = widthCalc;
        //     el.style.transition = isResizing ? 'none' : 'width 0.3s ease, right 0.3s ease';
        // });

        const etestPlayer = document.querySelector('.etest-player') as HTMLElement;
        if (etestPlayer) {
            etestPlayer.style.width = widthCalc;
            etestPlayer.style.right = rightOffset;
            etestPlayer.style.transition = isResizing ? 'none' : 'width 0.3s ease, right 0.3s ease';
        }

        // Fix: Just ensure main content fills the shrunk body, avoid double-shrinking
        const mainContent = document.getElementById('bar_mainDiv');
        if (mainContent) {
            mainContent.style.width = '100%';
            mainContent.style.transition = isResizing ? 'none' : 'width 0.3s ease';
        }
    }

    function createSidebarElements() {
        iframe = document.createElement('iframe');
        iframe.id = 'gemini-sidebar-frame';
        iframe.src = chrome.runtime.getURL('sidebar.html');
        iframe.style.position = 'fixed';
        iframe.style.right = `-${currentSidebarWidth}px`;
        iframe.style.border = 'none';
        iframe.style.zIndex = '2147483646';
        iframe.style.boxShadow = '-4px 0 20px rgba(0,0,0,0.1)';
        iframe.style.transition = 'right 0.3s cubic-bezier(0.16, 1, 0.3, 1)';
        iframe.style.background = '#fff';

        resizer = document.createElement('div');
        resizer.id = 'gemini-sidebar-resizer';
        resizer.style.position = 'fixed';
        resizer.style.width = '4px';
        resizer.style.cursor = 'ew-resize';
        resizer.style.zIndex = '2147483647';
        resizer.style.background = 'transparent';
        resizer.style.display = 'none';

        resizer.addEventListener('mouseenter', () => { resizer!.style.background = 'rgba(46, 125, 50, 0.3)'; });
        resizer.addEventListener('mouseleave', () => { if (!isResizing) resizer!.style.background = 'transparent'; });

        resizer.addEventListener('mousedown', (e) => {
            isResizing = true;
            document.body.style.cursor = 'ew-resize';
            document.body.style.userSelect = 'none';
            if (iframe) iframe.style.transition = 'none';

            const overlay = document.createElement('div');
            overlay.style.position = 'fixed';
            overlay.style.top = '0'; overlay.style.bottom = '0'; overlay.style.left = '0'; overlay.style.right = '0';
            overlay.style.zIndex = '2147483648';
            overlay.style.cursor = 'ew-resize';
            document.body.appendChild(overlay);

            const startX = e.clientX;
            const startWidth = currentSidebarWidth;

            const onMouseMove = (moveEvent: MouseEvent) => {
                if (!isResizing) return;
                const deltaX = startX - moveEvent.clientX;
                const newWidth = Math.max(200, Math.min(800, startWidth + deltaX));

                currentSidebarWidth = newWidth;
                if (iframe) iframe.style.width = `${newWidth}px`;
                if (resizer) resizer.style.right = `${newWidth}px`;
                updateLayout(newWidth);
            };

            const onMouseUp = () => {
                isResizing = false;
                document.body.style.cursor = '';
                document.body.style.userSelect = '';
                if (iframe) iframe.style.transition = 'right 0.3s cubic-bezier(0.16, 1, 0.3, 1)';
                overlay.remove();
                chrome.storage.local.set({ sidebarWidth: currentSidebarWidth });
                window.removeEventListener('mousemove', onMouseMove);
                window.removeEventListener('mouseup', onMouseUp);
                if (resizer) resizer.style.background = 'transparent';
            };

            window.addEventListener('mousemove', onMouseMove);
            window.addEventListener('mouseup', onMouseUp);
        });

        document.body.appendChild(iframe);
        document.body.appendChild(resizer);
    }

    chrome.runtime.onMessage.addListener((msg) => {
        if (msg.action === 'toggle_sidebar') toggleSidebar();
    });

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
