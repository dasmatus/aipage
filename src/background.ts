/**
 * Background Service Worker
 * Handles extension-wide tasks and acts as a CORS proxy for API requests.
 */

import { initUpdateManager } from './update-manager';

/**
 * Proxy Fetch Listener
 * Background scripts have higher privileges than the sidebar/page and can bypass CORS
 * for domains listed in the manifest's host_permissions.
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'proxy_fetch') {
        const { url, method, headers, body, raw } = message.payload;

        fetch(url, { method, headers, body })
            .then(async response => {
                // Raw mode: return an unparsed, Response-reconstructable payload.
                // Used by the Anthropic SDK fetch bridge (providers/utils.ts → proxyFetch),
                // which needs status/headers/body to rebuild a real Response for the SDK.
                if (raw) {
                    const headersObj: Record<string, string> = {};
                    response.headers.forEach((value, key) => { headersObj[key] = value; });
                    const text = await response.text();
                    sendResponse({
                        ok: response.ok,
                        status: response.status,
                        statusText: response.statusText,
                        headers: headersObj,
                        body: text
                    });
                    return;
                }

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
                console.error('Fetch error:', error);
                const isOffline = !navigator.onLine;
                const errorMsg = isOffline 
                    ? `Network error: You appear to be offline. Failed to fetch ${url}` 
                    : `Network error: Failed to fetch ${url}. ${error.message}`;
                sendResponse({ ok: false, error: errorMsg });
            });

        return true; // Keep channel open for async response
    }

    if (message.action === 'search_web') {
        const { query } = message.payload;
        
        // Use DuckDuckGo instant answer API (GET request, JSON response)
        const searchUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json`;
        
        fetch(searchUrl)
            .then(response => response.json())
            .then(data => {
                const results: Array<{title: string, snippet: string, url: string}> = [];
                
                // Extract abstract (main answer)
                if (data.AbstractText && data.AbstractURL) {
                    results.push({
                        title: data.Heading || 'Answer',
                        snippet: data.AbstractText,
                        url: data.AbstractURL
                    });
                }
                
                // Extract related topics (up to 5 total results)
                if (data.RelatedTopics && Array.isArray(data.RelatedTopics)) {
                    for (const topic of data.RelatedTopics) {
                        if (results.length >= 5) break;
                        
                        if (topic.Text && topic.FirstURL) {
                            results.push({
                                title: topic.Text.substring(0, 100),
                                snippet: topic.Text,
                                url: topic.FirstURL
                            });
                        }
                    }
                }
                
                sendResponse({ ok: true, results });
            })
            .catch(error => {
                console.error('Search error:', error);
                sendResponse({ ok: false, error: error.toString() });
            });
        
        return true; // Keep channel open for async response
    }
});

/**
 * Listen for extension icon clicks to toggle sidebar if needed.
 */
const actionAPI = chrome.action || chrome.browserAction;
if (actionAPI) {
    actionAPI.onClicked.addListener((tab) => {
        if (tab.id) {
            chrome.tabs.sendMessage(tab.id, { action: "toggle_sidebar" });
        }
    });
}

// Initialize auto-update check inside a try-catch for robustness
try {
    initUpdateManager();
} catch (e) {
    console.error('Failed to initialize update manager:', e);
}
