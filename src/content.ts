// Inject AI Button and Manage Sidebar Iframe

let sidebarOpen = false;
let iframe: HTMLIFrameElement | null = null;
let resizer: HTMLDivElement | null = null;
let currentSidebarWidth = 300; // Default width
let isResizing = false;

// EduPage Navbar identifier
const NAVBAR_ID = 'edubar';

function init() {
    // 1. Find the Quick Menu container (EduPage specific class)
    const quickMenu = document.querySelector('.edubarQuickmenu');
    if (!quickMenu) {
        console.log("EduBar QuickMenu not found, retrying in 1s...");
        setTimeout(init, 1000);
        return;
    }

    // 2. Check if button already exists
    if (document.getElementById('edubar-ai-btn')) return;

    // Load saved width
    chrome.storage.local.get(['sidebarWidth'], (result) => {
        if (result.sidebarWidth) {
            currentSidebarWidth = result.sidebarWidth;
        }
    });

    // 3. Create AI Button
    const btn = document.createElement('a');
    btn.id = 'edubar-ai-btn';
    btn.className = 'edubarChatBtn qbutton qbutton-normal tips-bottom';
    btn.style.cursor = 'pointer';
    btn.style.display = 'inline-flex';
    btn.style.alignItems = 'center';
    btn.style.gap = '6px';
    btn.setAttribute('title', 'AI Assistant');

    btn.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
        </svg>
    `;

    quickMenu.insertBefore(btn, quickMenu.firstChild);
    btn.addEventListener('click', toggleSidebar);
}

function getNavbarHeight(): number {
    const navbar = document.getElementById(NAVBAR_ID);
    return navbar ? navbar.offsetHeight : 0;
}

function toggleSidebar() {
    sidebarOpen = !sidebarOpen;
    if (sidebarOpen) {
        openSidebar();
    } else {
        closeSidebar();
    }
}

function openSidebar() {
    if (!iframe) {
        createSidebarElements();
    }

    const navbarHeight = getNavbarHeight();
    const topOffset = `${navbarHeight}px`;
    const heightCalc = `calc(100vh - ${navbarHeight}px)`;

    if (iframe) {
        iframe.style.top = topOffset;
        iframe.style.height = heightCalc;
        iframe.style.width = `${currentSidebarWidth}px`;
        iframe.style.right = '0px';
    }

    if (resizer) {
        resizer.style.top = topOffset;
        resizer.style.height = heightCalc;
        resizer.style.right = `${currentSidebarWidth}px`;
        resizer.style.display = 'block';
    }

    // Push content to the left
    updateLayout(currentSidebarWidth);
}

function closeSidebar() {
    if (iframe) iframe.style.right = `-${currentSidebarWidth}px`;
    if (resizer) resizer.style.display = 'none';

    updateLayout(0);
}

function updateLayout(width: number) {
    const margin = width > 0 ? `${width}px` : '0px';
    const widthCalc = width > 0 ? `calc(100% - ${width}px)` : '100%';

    document.body.style.width = widthCalc;
    document.body.style.position = 'relative';
    document.body.style.transition = isResizing ? 'none' : 'width 0.3s ease';

    const navbar = document.getElementById(NAVBAR_ID);
    if (navbar) {
        navbar.style.width = widthCalc;
        navbar.style.boxSizing = 'border-box';
        navbar.style.transition = isResizing ? 'none' : 'width 0.3s ease';
    }
}

function createSidebarElements() {
    // Create Iframe
    iframe = document.createElement('iframe');
    iframe.id = 'gemini-sidebar-frame';
    iframe.src = chrome.runtime.getURL('sidebar.html');
    iframe.style.position = 'fixed';
    iframe.style.right = `-${currentSidebarWidth}px`;
    iframe.style.border = 'none';
    iframe.style.zIndex = '2147483646'; // High, but maybe just under navbar if navbar is higher
    iframe.style.boxShadow = '-4px 0 20px rgba(0,0,0,0.1)';
    iframe.style.transition = 'right 0.3s cubic-bezier(0.16, 1, 0.3, 1)';
    iframe.style.background = '#000';
    iframe.style.display = 'block';
    iframe.style.visibility = 'visible';
    iframe.style.opacity = '1';

    // Create Resizer Handle
    resizer = document.createElement('div');
    resizer.id = 'gemini-sidebar-resizer';
    resizer.style.position = 'fixed';
    resizer.style.width = '8px';
    resizer.style.cursor = 'ew-resize';
    resizer.style.zIndex = '2147483647';
    resizer.style.background = 'transparent'; // Invisible but grab-able
    resizer.style.display = 'none';

    // Hover effect for resizer
    resizer.addEventListener('mouseenter', () => {
        resizer!.style.background = 'rgba(74, 158, 255, 0.2)';
    });
    resizer.addEventListener('mouseleave', () => {
        if (!isResizing) resizer!.style.background = 'transparent';
    });

    resizer.addEventListener('mousedown', (e) => {
        isResizing = true;
        document.body.style.cursor = 'ew-resize';
        document.body.style.userSelect = 'none';

        // Disable transitions during resize for snappiness
        if (iframe) iframe.style.transition = 'none';

        const startX = e.clientX;
        const startWidth = currentSidebarWidth;

        const onMouseMove = (moveEvent: MouseEvent) => {
            if (!isResizing) return;
            const deltaX = startX - moveEvent.clientX;
            const newWidth = Math.max(250, Math.min(800, startWidth + deltaX));

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

            // Save width
            chrome.storage.local.set({ sidebarWidth: currentSidebarWidth });

            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
            resizer!.style.background = 'transparent';
        };

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
    });

    document.body.appendChild(iframe);
    document.body.appendChild(resizer);
}

// Background Listener
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === 'toggle_sidebar') {
        toggleSidebar();
    }
});

// Run Init
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
