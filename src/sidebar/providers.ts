/**
 * AI Provider Abstraction Layer
 * 
 * This module defines the interface for AI providers and implements 
 * concrete classes for each supported service (Gemini, OpenAI, etc.).
 */

export type ProviderType = 'gemini' | 'openai' | 'claude' | 'mistral' | 'lmstudio' | 'ollama';

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
     */
    sendMessage(prompt: string, apiKey: string, options?: { baseUrl?: string, modelName?: string }): Promise<string>;
}

/**
 * Helper to perform requests via the background script proxy.
 * This is necessary to bypass CORS restrictions for both local and cloud APIs.
 */
async function performRequest(url: string, method: string, headers: Record<string, string>, body: string): Promise<any> {
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
            action: 'proxy_fetch',
            payload: { url, method, headers, body }
        }, (response) => {
            if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
                return;
            }
            if (response.ok) {
                resolve(response.data);
            } else {
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

    async sendMessage(prompt: string, apiKey: string, options?: { baseUrl?: string, modelName?: string }): Promise<string> {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${apiKey}`;

        const data = await performRequest(url, 'POST', { 'Content-Type': 'application/json' }, JSON.stringify({
            contents: [{ parts: [{ text: SYSTEM_PROMPT + "\n\n" + prompt }] }]
        }));

        return data.candidates?.[0]?.content?.parts?.[0]?.text || 'No response';
    }
}

/**
 * OpenAI Provider (supports GPT-4o-mini and others)
 */
export class OpenAIProvider implements AIProvider {
    name = 'openai';
    displayName = 'OpenAI ChatGPT';

    async sendMessage(prompt: string, apiKey: string, options?: { baseUrl?: string, modelName?: string }): Promise<string> {
        const url = 'https://api.openai.com/v1/chat/completions';

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

        return data.choices?.[0]?.message?.content || 'No response';
    }
}

/**
 * Anthropic Claude Provider
 */
export class ClaudeProvider implements AIProvider {
    name = 'claude';
    displayName = 'Anthropic Claude';

    async sendMessage(prompt: string, apiKey: string, options?: { baseUrl?: string, modelName?: string }): Promise<string> {
        const url = 'https://api.anthropic.com/v1/messages';

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

        return data.content?.[0]?.text || 'No response';
    }
}

/**
 * Mistral AI Provider
 */
export class MistralProvider implements AIProvider {
    name = 'mistral';
    displayName = 'Mistral AI';

    async sendMessage(prompt: string, apiKey: string, options?: { baseUrl?: string, modelName?: string }): Promise<string> {
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

        return data.choices?.[0]?.message?.content || 'No response';
    }
}

/**
 * LM Studio Provider (OpenAI compatible local server)
 */
export class LMStudioProvider implements AIProvider {
    name = 'lmstudio';
    displayName = 'LM Studio';

    async sendMessage(prompt: string, apiKey: string, options?: { baseUrl?: string, modelName?: string }): Promise<string> {
        const baseUrl = options?.baseUrl || 'http://localhost:1234/v1';
        const modelName = options?.modelName || 'loaded-model';
        const url = `${baseUrl}/chat/completions`;

        const data = await performRequest(url, 'POST', {
            'Content-Type': 'application/json'
        }, JSON.stringify({
            model: modelName,
            messages: [
                { role: 'system', content: SYSTEM_PROMPT },
                { role: 'user', content: prompt }
            ],
            temperature: 0.7
        }));

        return data.choices?.[0]?.message?.content || 'No response';
    }
}

/**
 * Ollama Provider (Local chat API)
 */
export class OllamaProvider implements AIProvider {
    name = 'ollama';
    displayName = 'Ollama';

    async sendMessage(prompt: string, apiKey: string, options?: { baseUrl?: string, modelName?: string }): Promise<string> {
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

        return data.message?.content || 'No response';
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
    ollama: new OllamaProvider()
};

/**
 * Factory function to retrieve a provider implementation by type.
 */
export function getProvider(type: ProviderType): AIProvider {
    return providers[type];
}
