import { AIProvider, SYSTEM_PROMPT } from './types';
import { performRequest } from './utils';

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
