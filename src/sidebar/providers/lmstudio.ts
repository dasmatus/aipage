import { AIProvider, SYSTEM_PROMPT } from './types';
import { performRequest } from './utils';

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
