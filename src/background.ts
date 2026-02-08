/**
 * Background Service Worker
 * Handles extension-wide tasks and acts as a CORS proxy for API requests.
 */

import { initUpdateManager } from './update-manager';

// Initialize auto-update check
initUpdateManager();

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
 * Parse DuckDuckGo HTML search results
 */
function parseSearchResults(html: string): Array<{title: string, snippet: string, url: string}> {
    const results: Array<{title: string, snippet: string, url: string}> = [];
    
    // Simple regex-based parsing of DuckDuckGo HTML
    // Look for result blocks: <div class="result__body"> containing title and snippet
    const resultRegex = /<div class="result__body">[\s\S]*?<a[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
    
    let match;
    while ((match = resultRegex.exec(html)) !== null && results.length < 5) {
        const url = match[1];
        const title = match[2].replace(/<[^>]*>/g, '').trim(); // Remove HTML tags
        const snippet = match[3].replace(/<[^>]*>/g, '').trim(); // Remove HTML tags
        
        if (title && snippet && url) {
            results.push({ title, snippet, url });
        }
    }
    
    return results;
}


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
                sendResponse({ ok: false, error: error.toString() });
            });
        
        return true; // Keep channel open for async response
    }
});
