import browser from "./polyfills/browser-polyfill";

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
    let currentSidebarWidth = 320;
    let isResizing = false;

    const NAVBAR_ID = 'edubar';
    const TEST_PLAYER_HEADER_CLASS = '.etest-player-header';
    let antiCheatInjected = false;

    let observer: MutationObserver | null = null;

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
        btn.setAttribute('title', 'AI A');

        btn.innerHTML = `
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
            </svg>
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

    const THEME_MAP: Record<string, { accent: string; text: string; bg?: string; header?: string; headerText?: string; border?: string }> = {
        'default': { accent: '#2e7d32', text: '#000000', bg: '#f4f6f8', header: '#356da5', headerText: '#ffffff', border: '#e0e0e0' },
        'sms': { accent: '#007aff', text: '#000000', bg: '#ffffff', header: '#f9f9f9', headerText: '#000000', border: '#e5e5ea' },
        'gradient': { accent: '#f81ce5', text: '#ffffff', bg: '#000000', header: '#111111', headerText: '#ffffff', border: '#333333' },
        'discord': { accent: '#5865f2', text: '#ffffff', bg: '#313338', header: '#2b2d31', headerText: '#dbdee1', border: '#1e1f22' },
        'tokyo': { accent: '#7aa2f7', text: '#ffffff', bg: '#1a1b26', header: '#24283b', headerText: '#c0caf5', border: '#15161e' },
        'mono': { accent: '#000000', text: '#000000', bg: '#ffffff', header: '#ffffff', headerText: '#000000', border: '#000000' }
    };

    function injectAntiCheat() {
        console.log('[Gemini Sidebar] Injecting anti-cheat protection');
        const script = document.createElement('script');
        script.src = chrome.runtime.getURL('anti_cheat.js');
        (document.head || document.documentElement).appendChild(script);
        script.onload = () => {
            script.remove();
        };
    }

    async function init() {
        console.log('[Gemini Sidebar] Initializing...');

        // Load settings first (await makes it synchronous-like)
        const result = await getStorage(['sidebarWidth', 'ai_sidebar_theme', 'ai_sidebar_global']);
        if (result.sidebarWidth) currentSidebarWidth = result.sidebarWidth;
        const globalThemeEnabled = !!result.ai_sidebar_global;

        // Cleanup stale elements from previous context
        document.getElementById('gemini-sidebar-frame')?.remove();
        document.getElementById('gemini-sidebar-resizer')?.remove();
        document.getElementById('edubar-ai-btn')?.remove(); // Remove button to reset event listeners

        iframe = null;
        resizer = null;
        sidebarOpen = false;

        sync();

        if (observer) observer.disconnect();
        observer = new MutationObserver(() => sync());
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

    function applyGlobalOverrides(theme: string = 'default', enabled: boolean = false) {
        const styleId = 'edupage-ai-overrides';
        let style = document.getElementById(styleId) as HTMLStyleElement;

        // If disabled, remove the style element if it exists and return
        if (!enabled) {
            if (style) style.remove();
            return;
        }

        if (!style) {
            style = document.createElement('style');
            style.id = styleId;
            document.head.appendChild(style);
        }

        const colors = THEME_MAP[theme] || THEME_MAP['default'];
        const isDark = ['gradient', 'discord', 'tokyo'].includes(theme);

        style.textContent = `
            :root {
                --eduba-accent: ${colors.accent};
                --eduba-bg: ${colors.bg};
                --eduba-header: ${colors.header};
                --eduba-header-text: ${colors.headerText};
                --eduba-body-text: ${colors.text};
                --eduba-border: ${colors.border};
            }

            /* Header & Navigation */
            #edubarHeader, .edubarHeader,            /* Header & Navigation - Colors */
            #edubarHeader, .edubarHeader, .edubarHeaderInner, 
            .etest-player-header, .etest-player-header-inner { 
                background: var(--eduba-header) !important; 
                color: var(--eduba-header-text) !important;
            }
            /* Header Borders - Outer Only */
            #edubarHeader, .etest-player-header {
                border-bottom: 1px solid var(--eduba-border) !important;
            }

            /* Buttons & Icons in Header */
            .edubarChatBtn, .etest-action-button, .edubarSmartLink, .ebicon {
                color: var(--eduba-header-text) !important;
            }
            .edubarChatBtn:hover, .etest-action-button:hover, .edubarSmartLink:hover {
                background-color: rgba(127,127,127, 0.1) !important;
            }

            /* Main Body Background */
            ${isDark ? `
                body, #docbody, .standardBody, .edubarMainNoSkin, .etest-player {
                    background-color: var(--eduba-bg) !important;
                    color: var(--eduba-body-text) !important;
                }
                .edubarSidemenu, .edubarSidemenu2 {
                    background-color: var(--eduba-header) !important;
                    border-right: 1px solid var(--eduba-border) !important;
                }
                .edubarMenuitem, .edubarMenuitem a, .edubarMenuitem span {
                    color: var(--eduba-body-text) !important;
                }
                .etest-player-content, .etest-screen-inner {
                    background-color: var(--eduba-bg) !important;
                }
                /* Cards/Input areas in dark mode */
                .testme-card, .etest-answer-input-field, .etest-text {
                    background-color: var(--eduba-header) !important;
                    color: var(--eduba-body-text) !important;
                    border-color: var(--eduba-border) !important;
                }
            ` : ''}

            /* Fix Specific Elements */
            .title, span.title {
                color: var(--eduba-body-text) !important;
            }

            /* AI Button Specifics */
            #edubar-ai-btn { 
                transition: transform 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275);
                color: var(--eduba-header-text) !important;
                z-index: 2147483650 !important;
                position: relative !important;
            }
            #edubar-ai-btn:hover { 
                transform: scale(1.1); 
                color: var(--eduba-accent) !important;
            }

            /* Selection */
            ::selection { background-color: ${colors.accent} !important; color: ${colors.text} !important; }
            
            /* Prevent test player header from moving/shrinking */
            .etest-player-header {
                width: 100vw !important;
                right: 0 !important;
                left: 0 !important;
                max-width: none !important;
                z-index: 2147483648 !important;
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

    function getUserInitials(): string {
        const profileBox = document.getElementById('edubarProfileBox');
        if (!profileBox) return '';
        const name = profileBox.innerText || '';
        const initials = name.match(/[A-Z]/g) || [];
        return initials.join('');
    }

    function createSidebarElements() {
        // Double check to prevent duplicates
        document.getElementById('gemini-sidebar-frame')?.remove();
        document.getElementById('gemini-sidebar-resizer')?.remove();

        const initials = getUserInitials();

        iframe = document.createElement('iframe');
        iframe.id = 'gemini-sidebar-frame';
        iframe.src = chrome.runtime.getURL('sidebar.html') + (initials ? `#initials=${initials}` : '');
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
                const newWidth = Math.max(250, Math.min(450, startWidth + deltaX));

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
                browser.storage.local.set({ sidebarWidth: currentSidebarWidth });
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

    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
        if (msg.action === 'toggle_sidebar') {
            toggleSidebar();
            return false;
        } 
        
        if (msg.action === 'get_page_content') {
            (async () => {
                try {
                    // Prioritize selection
                    const selection = window.getSelection();
                    const selectionText = selection?.toString().trim();

                    if (selectionText) {
                        sendResponse({ content: selectionText, isSelection: true });
                        return;
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
                    
                    sendResponse({ content: text, isSelection: false });
                } catch (e) {
                    console.error('[Gemini Sidebar] Content scan failed:', e);
                    sendResponse({ content: null, error: (e as Error).toString() });
                }
            })();
            return true; // Keep channel open for async response
        }
    });

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
