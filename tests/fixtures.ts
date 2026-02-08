
import { test as base, expect, type Page } from '@playwright/test';
import path from 'path';

// Helper to get the correct build path based on project
export const getDistPath = (projectName: string) => {
    switch (projectName) {
        case 'firefox':
            return 'dist-firefox/sidebar.html';
        case 'webkit':
            return 'dist-safari/sidebar.html';
        default:
            return 'dist-chrome/sidebar.html';
    }
};

export const resolvePath = (relativePath: string) => {
    return path.resolve(process.cwd(), relativePath);
};

// Extend base test with our mocks
export const test = base.extend<{
    mockBrowser: void;
}>({
    mockBrowser: async ({ page }, use) => {
        await page.addInitScript(() => {
            const storage: Record<string, any> = {};
            const listeners: any[] = [];

            // Mock Tabs API
            const mockTabs = {
                query: async (queryInfo: any) => {
                    // Support both currentWindow and lastFocusedWindow
                    if (queryInfo.active && (queryInfo.currentWindow || queryInfo.lastFocusedWindow)) {
                        return [{ id: 1, url: 'https://example.com', title: 'Test Page' }];
                    }
                    if (queryInfo.active) {
                        // Fallback for just active
                         return [{ id: 1, url: 'https://example.com', title: 'Test Page' }];
                    }
                    return [];
                },
                sendMessage: async (tabId: number, message: any) => {
                    if (message.action === 'get_page_content') {
                        return {
                            content: 'Sample page content for testing.',
                            isSelection: false,
                            images: []
                        };
                    }
                    return {};
                }
            };

            // Mock Runtime & Storage
            const chromeAPI = {
                storage: {
                    local: {
                        get: async (keys: string[] | string, callback?: (result: any) => void) => {
                            const result: Record<string, any> = {};
                            const keyList = Array.isArray(keys) ? keys : [keys];
                            for (const key of keyList) {
                                if (storage[key] !== undefined) {
                                    result[key] = storage[key];
                                }
                            }
                            if (callback) callback(result);
                            return result;
                        },
                        set: async (items: Record<string, any>, callback?: () => void) => {
                            Object.assign(storage, items);
                            if (callback) callback();
                        },
                        remove: async (keys: string[] | string, callback?: () => void) => {
                            const keyList = Array.isArray(keys) ? keys : [keys];
                            for (const key of keyList) {
                                delete storage[key];
                            }
                            if (callback) callback();
                        },
                        onChanged: { addListener: () => {} }
                    }
                },
                runtime: {
                    getURL: (path: string) => path,
                    sendMessage: (message: any, callback: (response: any) => void) => {
                        // Mock LLM response for proxy_fetch
                        if (message.action === 'proxy_fetch') {
                             const mockResponse = {
                                  ok: true,
                                  data: {
                                      choices: [{ message: { content: 'Mocked LLM Response' } }],
                                      candidates: [{ content: { parts: [{ text: 'Mocked Gemini Response' }] } }]
                                  }
                              };
                             // Support both callback and promise return styles if needed, but runtime.sendMessage usually takes callback
                             if (callback) callback(mockResponse);
                             return true; // Keep channel open
                        }
                        // Default resolve for others to prevent hang
                        if (callback) callback({}); 
                        return true; 
                    },
                    onMessage: {
                        addListener: (cb: any) => listeners.push(cb)
                    }
                },
                tabs: mockTabs
            };

            // Expose as chrome and browser
            (window as any).chrome = chromeAPI;
            (window as any).browser = {
                storage: chromeAPI.storage,
                runtime: {
                     getURL: chromeAPI.runtime.getURL,
                     sendMessage: async (message: any) => {
                         return new Promise((resolve) => {
                             chromeAPI.runtime.sendMessage(message, resolve);
                         });
                     },
                     onMessage: chromeAPI.runtime.onMessage
                },
                tabs: mockTabs
            };
        });
        
        // Listen for console logs
        page.on('console', msg => {
            const text = msg.text();
            if (msg.type() === 'error') console.error(`[Browser Error] ${text}`);
            else console.log(`[Browser Log] ${text}`);
        });

        await use();
    },
});

export { expect };
