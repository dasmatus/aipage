import browser from '../../polyfills/browser-polyfill';

/**
 * Helper to perform requests via the background script proxy.
 * This is necessary to bypass CORS restrictions for both local and cloud APIs.
 */
export async function performRequest(url: string, method: string, headers: Record<string, string>, body: string | null = null): Promise<any> {
    try {
        const response: any = await browser.runtime.sendMessage({
            action: 'proxy_fetch',
            payload: { url, method, headers, body }
        });

        if (!response) {
            throw new Error('No response from background script');
        }

        if (response.ok) {
            let result = response.data;
            console.log(`PerformRequest Success: ${url}, type: ${typeof result}`);
            if (typeof result === 'string') {
                try {
                    result = JSON.parse(result);
                    console.log(`Parsed JSON result for ${url}`);
                } catch (e) {
                    console.warn(`Failed to parse JSON for ${url}: ${result.substring(0, 100)}`);
                }
            }
            return result;
        } else {
            console.error(`PerformRequest Failed: ${url}`, response);
            const errorMsg = typeof response.data === 'object' ?
                (response.data.error?.message || response.data.message || JSON.stringify(response.data)) :
                (response.data || response.error || 'Unknown error');
            throw new Error(errorMsg);
        }
    } catch (error: any) {
        if (error.message?.includes('Could not establish connection')) {
            throw new Error('Extension connection lost. Please refresh the page and the sidebar.');
        }
        throw error;
    }
}
