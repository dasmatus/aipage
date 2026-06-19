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

/**
 * A `fetch` implementation that routes through the background CORS proxy and
 * reconstructs a standard `Response`.
 *
 * The sidebar runs in a cross-origin iframe and cannot fetch external APIs
 * directly (see CLAUDE.md → "CORS proxy is mandatory"). The official Anthropic
 * SDK does its own `fetch`, so we hand it this bridge via `new Anthropic({ fetch: proxyFetch })`.
 * The background script performs the real request in `raw` mode and returns
 * { status, statusText, headers, body }, which we turn back into a `Response`.
 */
export const proxyFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const reqObj = typeof input !== 'string' && !(input instanceof URL) ? (input as Request) : null;
    const url = reqObj ? reqObj.url : input.toString();
    const method = (init?.method || reqObj?.method || 'GET').toUpperCase();

    // Normalize headers (Headers | array | record) to a plain object.
    const headers: Record<string, string> = {};
    const headerSource = init?.headers ?? (reqObj ? reqObj.headers : undefined);
    if (headerSource) {
        if (typeof (headerSource as any).forEach === 'function') {
            // Headers-like (DOM Headers / undici Headers)
            (headerSource as any).forEach((v: string, k: string) => { headers[k] = v; });
        } else if (Array.isArray(headerSource)) {
            for (const [k, v] of headerSource as [string, string][]) headers[k] = v;
        } else {
            Object.assign(headers, headerSource as Record<string, string>);
        }
    }
    // Strip headers the background `fetch` is not allowed to set.
    for (const k of Object.keys(headers)) {
        const lk = k.toLowerCase();
        if (lk === 'user-agent' || lk === 'content-length' || lk === 'connection' || lk === 'host') {
            delete headers[k];
        }
    }

    let body: string | null = null;
    if (init?.body != null) {
        body = typeof init.body === 'string' ? init.body : await new Response(init.body as BodyInit).text();
    } else if (reqObj) {
        body = (await reqObj.clone().text()) || null;
    }

    const res: any = await browser.runtime.sendMessage({
        action: 'proxy_fetch',
        payload: { url, method, headers, body, raw: true }
    });

    if (!res) throw new Error('No response from background script');
    if (res.ok === false && res.status == null) {
        // Network-level failure surfaced by the background script (no HTTP status).
        throw new Error(res.error || 'Network error');
    }

    return new Response(res.body ?? '', {
        status: res.status ?? 502,
        statusText: res.statusText ?? '',
        headers: res.headers ?? {}
    });
};
