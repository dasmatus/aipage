export const THEME_MAP: Record<string, { accent: string; text: string; bg?: string; header?: string; headerText?: string; border?: string }> = {
    'default': { accent: '#2e7d32', text: '#000000', bg: '#f4f6f8', header: '#356da5', headerText: '#ffffff', border: '#e0e0e0' },
    'sms': { accent: '#007aff', text: '#000000', bg: '#ffffff', header: '#f9f9f9', headerText: '#000000', border: '#e5e5ea' },
    'gradient': { accent: '#f81ce5', text: '#ffffff', bg: '#000000', header: '#111111', headerText: '#ffffff', border: '#333333' },
    'discord': { accent: '#5865f2', text: '#ffffff', bg: '#313338', header: '#2b2d31', headerText: '#dbdee1', border: '#1e1f22' },
    'tokyo': { accent: '#7aa2f7', text: '#ffffff', bg: '#1a1b26', header: '#24283b', headerText: '#c0caf5', border: '#15161e' },
    'mono': { accent: '#000000', text: '#000000', bg: '#ffffff', header: '#ffffff', headerText: '#000000', border: '#000000' }
};

export function applyGlobalOverrides(theme: string = 'default', enabled: boolean = false) {
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
