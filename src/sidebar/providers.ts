/**
 * AI Provider Abstraction Layer
 * 
 * This module defines the interface for AI providers and implements 
 * concrete classes for each supported service (Gemini, OpenAI, etc.).
 */

export type ProviderType = 'gemini' | 'openai' | 'claude' | 'mistral' | 'lmstudio' | 'ollama' | 'vercel';

const SYSTEM_PROMPT = "You are a helpful assistant that answers questions correctly.";

/**
 * Interface that all AI providers must implement.
 */
export interface AIProvider {
    name: string;
    displayName: string;
    /**
     * Sends a prompt to the AI provider and returns the response.
     * @param prompt The user's input text
     * @param apiKey API key for authentication (optional for local providers)
     * @param options Additional configuration like baseUrl or modelName
     * @param onProgress Optional callback for streaming tokens (not supported by all providers)
     */
    sendMessage(
        prompt: string, 
        apiKey: string, 
        options?: { baseUrl?: string, modelName?: string },
        onProgress?: (chunk: string) => void
    ): Promise<string>;
    
    /**
     * Fetches available models from the provider (if supported).
     * Returns an array of model objects { id: string, pricing?: string, tags?: string[] }.
     */
    getModels?(apiKey: string, options?: { baseUrl?: string }): Promise<any[]>;
}

/**
 * Helper to perform requests via the background script proxy.
 * This is necessary to bypass CORS restrictions for both local and cloud APIs.
 */
async function performRequest(url: string, method: string, headers: Record<string, string>, body: string | null = null): Promise<any> {
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
            action: 'proxy_fetch',
            payload: { url, method, headers, body }
        }, (response) => {
            if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
                return;
            }
            if (!response) {
                reject(new Error('No response from background script'));
                return;
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
                resolve(result);
            } else {
                console.error(`PerformRequest Failed: ${url}`, response);
                const errorMsg = typeof response.data === 'object' ?
                    (response.data.error?.message || response.data.message || JSON.stringify(response.data)) :
                    (response.data || response.error || 'Unknown error');
                reject(new Error(errorMsg));
            }
        });
    });
}

/**
 * Google Gemini Provider
 */
export class GeminiProvider implements AIProvider {
    name = 'gemini';
    displayName = 'Google Gemini';

    async sendMessage(
        prompt: string, 
        apiKey: string, 
        options?: { baseUrl?: string, modelName?: string },
        onProgress?: (chunk: string) => void
    ): Promise<string> {
        const model = options?.modelName || 'gemini-pro';
        const baseUrl = options?.baseUrl ? (options.baseUrl.endsWith('/v1') ? options.baseUrl.slice(0, -3) : options.baseUrl) : 'https://generativelanguage.googleapis.com/v1beta';
        const url = `${baseUrl}/models/${model}:generateContent?key=${apiKey}`;

        const data = await performRequest(url, 'POST', { 'Content-Type': 'application/json' }, JSON.stringify({
            contents: [{ parts: [{ text: SYSTEM_PROMPT + "\n\n" + prompt }] }]
        }));

        const text = data.candidates?.[0]?.content?.parts?.[0]?.text || 'No response';
        if (onProgress) onProgress(text);
        return text;
    }

    async getModels(apiKey: string, options?: { baseUrl?: string }): Promise<string[]> {
        // If baseUrl is provided and looks like an OpenAI-style gateway (e.g. Vercel), use that
        if (options?.baseUrl && (options.baseUrl.includes('vercel') || options.baseUrl.includes('api.openai.com'))) {
            try {
                const url = options.baseUrl.endsWith('/v1') ? `${options.baseUrl}/models` : `${options.baseUrl}/v1/models`;
                const data = await performRequest(url, 'GET', {
                    'Authorization': apiKey ? `Bearer ${apiKey}` : ''
                });
                return data.data.map((m: any) => ({ id: m.id, provider: 'Google' }));
            } catch (e) {
                console.error('Failed to fetch models from gateway', e);
            }
        }

        const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
        try {
            const data = await performRequest(url, 'GET', {});
            // Gemini returns { models: [ { name: "models/gemini-1.5-pro", ... } ] }
            return data.models.map((m: any) => ({ id: m.name.replace('models/', ''), provider: 'Google' }));
        } catch (e) {
            console.error('Failed to fetch Gemini models', e);
            return [];
        }
    }
}

/**
 * OpenAI Provider (supports GPT-4o-mini and others)
 */
export class OpenAIProvider implements AIProvider {
    name = 'openai';
    displayName = 'OpenAI ChatGPT';

    async sendMessage(
        prompt: string, 
        apiKey: string, 
        options?: { baseUrl?: string, modelName?: string },
        onProgress?: (chunk: string) => void
    ): Promise<string> {
        const url = options?.baseUrl ? `${options.baseUrl}/chat/completions` : 'https://api.openai.com/v1/chat/completions';

        const data = await performRequest(url, 'POST', {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        }, JSON.stringify({
            model: options?.modelName || 'gpt-4o-mini',
            messages: [
                { role: 'system', content: SYSTEM_PROMPT },
                { role: 'user', content: prompt }
            ],
            temperature: 0.7
        }));

        const text = data.choices?.[0]?.message?.content || 'No response';
        if (onProgress) onProgress(text);
        return text;
    }

    async getModels(apiKey: string, options?: { baseUrl?: string }): Promise<any[]> {
        let url = options?.baseUrl || 'https://api.openai.com/v1';
        if (url.endsWith('/')) url = url.slice(0, -1);
        const fetchUrl = url.endsWith('/models') ? url : `${url}/models`;

        try {
            const data = await performRequest(fetchUrl, 'GET', {
                'Authorization': apiKey ? `Bearer ${apiKey}` : ''
            });
            return data.data.map((m: any) => ({ id: m.id, provider: 'OpenAI' }));
        } catch (e) {
            console.error('Failed to fetch OpenAI models', e);
            return [];
        }
    }
}

/**
 * Anthropic Claude Provider
 */
export class ClaudeProvider implements AIProvider {
    name = 'claude';
    displayName = 'Anthropic Claude';

    async sendMessage(
        prompt: string, 
        apiKey: string, 
        options?: { baseUrl?: string, modelName?: string },
        onProgress?: (chunk: string) => void
    ): Promise<string> {
        const url = options?.baseUrl ? `${options.baseUrl}/messages` : 'https://api.anthropic.com/v1/messages';

        const data = await performRequest(url, 'POST', {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01'
        }, JSON.stringify({
            model: options?.modelName || 'claude-3-5-sonnet-20241022',
            max_tokens: 1024,
            system: SYSTEM_PROMPT,
            messages: [{ role: 'user', content: prompt }]
        }));

        const text = data.content?.[0]?.text || 'No response';
        if (onProgress) onProgress(text);
        return text;
    }
}

/**
 * Mistral AI Provider
 */
export class MistralProvider implements AIProvider {
    name = 'mistral';
    displayName = 'Mistral AI';

    async sendMessage(
        prompt: string, 
        apiKey: string, 
        options?: { baseUrl?: string, modelName?: string },
        onProgress?: (chunk: string) => void
    ): Promise<string> {
        const url = 'https://api.mistral.ai/v1/chat/completions';

        const data = await performRequest(url, 'POST', {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        }, JSON.stringify({
            model: options?.modelName || 'mistral-small-latest',
            messages: [
                { role: 'system', content: SYSTEM_PROMPT },
                { role: 'user', content: prompt }
            ]
        }));

        const text = data.choices?.[0]?.message?.content || 'No response';
        if (onProgress) onProgress(text);
        return text;
    }

    async getModels(apiKey: string, options?: { baseUrl?: string }): Promise<any[]> {
        let url = options?.baseUrl || 'https://api.mistral.ai/v1';
        if (url.endsWith('/')) url = url.slice(0, -1);
        const fetchUrl = url.endsWith('/models') ? url : `${url}/models`;

        try {
            const data = await performRequest(fetchUrl, 'GET', {
                'Authorization': apiKey ? `Bearer ${apiKey}` : `Bearer ${apiKey}`
            });
            return data.data.map((m: any) => ({ id: m.id }));
        } catch (e) {
            console.error('Failed to fetch Mistral models', e);
            return [];
        }
    }
}

/**
 * LM Studio Provider (Reverted to standard REST API)
 */
export class LMStudioProvider implements AIProvider {
    name = 'lmstudio';
    displayName = 'LM Studio';

    async sendMessage(
        prompt: string, 
        apiKey: string, 
        options?: { baseUrl?: string, modelName?: string },
        onProgress?: (chunk: string) => void
    ): Promise<string> {
        let baseUrl = options?.baseUrl || 'http://localhost:1234';
        
        // Ensure HTTP protocol for REST
        if (baseUrl.startsWith('ws://')) {
            baseUrl = baseUrl.replace('ws://', 'http://');
        } else if (baseUrl.startsWith('wss://')) {
            baseUrl = baseUrl.replace('wss://', 'https://');
        }

        if (baseUrl.endsWith('/v1')) {
            baseUrl = baseUrl.substring(0, baseUrl.length - 3);
        }
        
        const url = `${baseUrl}/v1/chat/completions`;
        const modelName = options?.modelName || 'local-model';

        const data = await performRequest(url, 'POST', {
            'Content-Type': 'application/json'
        }, JSON.stringify({
            model: modelName,
            messages: [
                { role: 'system', content: SYSTEM_PROMPT },
                { role: 'user', content: prompt }
            ],
            temperature: 0.7,
            stream: false
        }));

        const text = data.choices?.[0]?.message?.content || 'No response';
        if (onProgress) onProgress(text);
        return text;
    }

    async getModels(apiKey: string, options?: { baseUrl?: string }): Promise<any[]> {
        let baseUrl = options?.baseUrl || 'http://localhost:1234';
        if (baseUrl.endsWith('/v1')) baseUrl = baseUrl.substring(0, baseUrl.length - 3);
        
        try {
            const data = await performRequest(`${baseUrl}/v1/models`, 'GET', {});
            // LM Studio /v1/models returns { data: [ { id: "model-id", ... } ] }
            return data.data.map((m: any) => ({ id: m.id, provider: 'LM Studio' }));
        } catch (e) {
            console.error('Failed to fetch LM Studio models', e);
            return [];
        }
    }
}

/**
 * Ollama Provider (Local chat API)
 */
export class OllamaProvider implements AIProvider {
    name = 'ollama';
    displayName = 'Ollama';

    async sendMessage(
        prompt: string, 
        apiKey: string, 
        options?: { baseUrl?: string, modelName?: string },
        onProgress?: (chunk: string) => void
    ): Promise<string> {
        const baseUrl = options?.baseUrl || 'http://localhost:11434';
        const modelName = options?.modelName || 'llama3';
        const url = `${baseUrl}/api/chat`;

        const data = await performRequest(url, 'POST', {
            'Content-Type': 'application/json'
        }, JSON.stringify({
            model: modelName,
            messages: [
                { role: 'system', content: SYSTEM_PROMPT },
                { role: 'user', content: prompt }
            ],
            stream: false
        }));

        const text = data.message?.content || 'No response';
        if (onProgress) onProgress(text);
        return text;
    }
    
    async getModels(apiKey: string, options?: { baseUrl?: string }): Promise<string[]> {
        const baseUrl = options?.baseUrl || 'http://localhost:11434';
        try {
            const data = await performRequest(`${baseUrl}/api/tags`, 'GET', {});
            // Ollama /api/tags returns { models: [ { name: "llama3", ... } ] }
            return data.models.map((m: any) => ({ id: m.name, provider: 'Ollama' }));
        } catch (e) {
            console.error('Failed to fetch Ollama models', e);
            return [];
        }
    }
}

/**
 * Vercel AI SDK Provider (Gateway)
 */
export class VercelSDKProvider implements AIProvider {
    name = 'vercel';
    displayName = 'Vercel AI SDK';

    async sendMessage(
        prompt: string, 
        apiKey: string, 
        options?: { baseUrl?: string, modelName?: string },
        onProgress?: (chunk: string) => void
    ): Promise<string> {
        const url = options?.baseUrl ? `${options.baseUrl}/chat/completions` : 'https://ai-gateway.vercel.sh/v1/chat/completions';

        const data = await performRequest(url, 'POST', {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        }, JSON.stringify({
            model: options?.modelName || 'openai:gpt-4o-mini',
            messages: [
                { role: 'system', content: SYSTEM_PROMPT },
                { role: 'user', content: prompt }
            ],
            temperature: 0.7
        }));

        const text = data.choices?.[0]?.message?.content || 'No response';
        if (onProgress) onProgress(text);
        return text;
    }

    async getModels(apiKey: string, options?: { baseUrl?: string }): Promise<any[]> {
        const url = options?.baseUrl ? `${options.baseUrl}/models` : 'https://ai-gateway.vercel.sh/v1/models';

        try {
            const data = await performRequest(url, 'GET', {
                'Authorization': `Bearer ${apiKey}`
            });
            const models = data.data
                .filter((m: any) => m.type === 'language' && m.id)
                .map((m: any) => {
                    let provider = 'other';
                    if (m.id.includes(':')) {
                        provider = m.id.split(':')[0];
                    } else if (m.id.includes('/')) {
                        provider = m.id.split('/')[0];
                    }
                    
                    return {
                        id: m.id,
                        provider: provider.charAt(0).toUpperCase() + provider.slice(1),
                        pricing: m.pricing?.prompt ? `${m.pricing.prompt}/${m.pricing.completion} (1M)` : '',
                        tags: m.tags || []
                    };
                });

            // Sort models by provider, then tags, then id
            return models.sort((a: any, b: any) => {
                const providerCompare = a.provider.localeCompare(b.provider);
                if (providerCompare !== 0) return providerCompare;
                
                if (a.tags.length > 0 && b.tags.length === 0) return -1;
                if (a.tags.length === 0 && b.tags.length > 0) return 1;
                return a.id.localeCompare(b.id);
            });
        } catch (e) {
            console.error('Failed to fetch Vercel models', e);
            return [];
        }
    }
}

/**
 * Global registry of AI providers
 */
export const providers: Record<ProviderType, AIProvider> = {
    gemini: new GeminiProvider(),
    openai: new OpenAIProvider(),
    claude: new ClaudeProvider(),
    mistral: new MistralProvider(),
    lmstudio: new LMStudioProvider(),
    ollama: new OllamaProvider(),
    vercel: new VercelSDKProvider()
};

/**
 * Factory function to retrieve a provider implementation by type.
 */
export function getProvider(type: ProviderType): AIProvider {
    return providers[type];
}
