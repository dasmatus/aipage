import { AIProvider, SYSTEM_PROMPT } from './types';
import { performRequest } from './utils';

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
