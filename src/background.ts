/**
 * Background Service Worker
 * Handles extension-wide tasks and acts as a CORS proxy for API requests.
 */

/**
 * Listen for extension icon clicks to toggle sidebar if needed.
 */
const actionAPI = chrome.action || chrome.browserAction;
actionAPI.onClicked.addListener((tab) => {
    if (tab.id) {
        chrome.tabs.sendMessage(tab.id, { action: "toggle_sidebar" });
    }
});

/**
 * Proxy Fetch Listener
 * Background scripts have higher privileges than the sidebar/page and can bypass CORS
 * for domains listed in the manifest's host_permissions.
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'proxy_fetch') {
        const { url, method, headers, body } = message.payload;

            fetch(url, { method, headers, body })
            .then(async response => {
                const contentType = response.headers.get('content-type');
                let data;
                
                if (contentType && contentType.includes('application/json')) {
                    data = await response.json();
                    sendResponse({
                        ok: response.ok,
                        status: response.status,
                        data
                    });
                } else if (contentType && contentType.startsWith('image/')) {
                    const blob = await response.blob();
                    const reader = new FileReader();
                    reader.onloadend = () => {
                        sendResponse({
                            ok: response.ok,
                            status: response.status,
                            data: reader.result // Base64 string
                        });
                    };
                    reader.onerror = () => {
                        sendResponse({ ok: false, error: 'Failed to read blob' });
                    };
                    reader.readAsDataURL(blob);
                } else {
                    data = await response.text();
                    sendResponse({
                        ok: response.ok,
                        status: response.status,
                        data
                    });
                }
            })
            .catch(error => {
                sendResponse({ ok: false, error: error.message });
            });

        return true; // Keep channel open for async response
    }
});
