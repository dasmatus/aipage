// Inject AI Button and Manage Sidebar Iframe

let sidebarOpen = false;
let iframe: HTMLIFrameElement | null = null;
const SIDEBAR_WIDTH = 300; // px

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

    // 3. Create AI Button (styled like existing buttons but with flair)
    const btn = document.createElement('a');
    btn.id = 'edubar-ai-btn';
    btn.className = 'edubarChatBtn qbutton qbutton-normal tips-bottom'; // Use existing class for styling
    btn.style.cursor = 'pointer';
    btn.style.display = 'inline-flex';
    btn.style.alignItems = 'center';
    btn.style.gap = '6px';
    btn.setAttribute('title', 'AI Assistant');

    // Add Star Icon
    btn.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
        </svg>
    `;

    // 4. Insert button at the beginning of the menu
    quickMenu.insertBefore(btn, quickMenu.firstChild);

    // 5. Add Click Listener
    btn.addEventListener('click', toggleSidebar);
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
        createIframe();
    }
    if (iframe) iframe.style.right = '0px'; // Slide in

    // Resize Body Logic (Prevent Overlap)
    document.body.style.width = `calc(100% - ${SIDEBAR_WIDTH}px)`;
    document.body.style.position = 'relative'; // Ensure layout respects width
    document.body.style.transition = 'width 0.3s ease';

    // Fix for Fixed Headers (EduPage likely has #edubar fixed)
    const edubar = document.getElementById('edubar');
    if (edubar) {
        edubar.style.width = `calc(100% - ${SIDEBAR_WIDTH}px)`;
        edubar.style.boxSizing = 'border-box'; // Ensure padding doesn't break width
        edubar.style.transition = 'width 0.3s ease';
    }
}

function closeSidebar() {
    if (iframe) iframe.style.right = `-${SIDEBAR_WIDTH}px`; // Slide out

    // Reset Body
    document.body.style.width = '100%';

    const edubar = document.getElementById('edubar');
    if (edubar) {
        edubar.style.width = '100%';
    }
}

function createIframe() {
    iframe = document.createElement('iframe');
    iframe.id = 'gemini-sidebar-frame';
    iframe.src = chrome.runtime.getURL('sidebar.html');

    // Styles
    iframe.style.position = 'fixed';
    iframe.style.top = '0';
    iframe.style.right = `-${SIDEBAR_WIDTH}px`; // Start hidden
    iframe.style.width = `${SIDEBAR_WIDTH}px`;
    iframe.style.height = '100vh';
    iframe.style.border = 'none';
    iframe.style.zIndex = '2147483647'; // Max Z-Index
    iframe.style.boxShadow = '-4px 0 20px rgba(0,0,0,0.1)';
    iframe.style.transition = 'right 0.3s cubic-bezier(0.16, 1, 0.3, 1)'; // Smooth ease
    iframe.style.background = '#000'; // Match sidebar bg

    document.documentElement.appendChild(iframe);
}

// Background Listener for external toggles
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
