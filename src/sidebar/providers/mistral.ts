import { AIProvider, SYSTEM_PROMPT } from './types';
import { performRequest } from './utils';

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
