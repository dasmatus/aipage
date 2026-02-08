import { AIProvider, SYSTEM_PROMPT } from './types';
import { performRequest } from './utils';

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
