import { AIProvider, SYSTEM_PROMPT } from './types';
import { performRequest } from './utils';

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
