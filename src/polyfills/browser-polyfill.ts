/**
 * Browser Polyfill for Cross-Browser Extension Compatibility
 * Normalizes the differences between Chrome, Firefox, and Safari extension APIs
 */

import browser from 'webextension-polyfill';

// Export the browser object for use throughout the extension
export default browser;

/**
 * Get the proper extension URL based on the browser
 */
export function getExtensionURL(path: string): string {
    return browser.runtime.getURL(path);
}

/**
 * Storage helper with consistent API across browsers
 */
export const storage = {
    async get<T>(keys: string | string[]): Promise<Record<string, T>> {
        return browser.storage.local.get(keys) as Promise<Record<string, T>>;
    },
    
    async set(items: Record<string, unknown>): Promise<void> {
        return browser.storage.local.set(items);
    },
    
    async remove(keys: string | string[]): Promise<void> {
        return browser.storage.local.remove(keys);
    }
};

/**
 * Messaging helper for consistent communication
 */
export const messaging = {
    async sendMessage<T>(message: unknown): Promise<T> {
        return browser.runtime.sendMessage(message) as Promise<T>;
    },
    
    onMessage(callback: (message: any, sender: browser.Runtime.MessageSender) => void | Promise<any>) {
        browser.runtime.onMessage.addListener(callback);
    }
};
