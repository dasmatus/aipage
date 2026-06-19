import Anthropic from '@anthropic-ai/sdk';
import { AIProvider, SYSTEM_PROMPT } from './types';
import { proxyFetch } from './utils';

/**
 * Default Claude model. Anthropic's most capable Opus-tier model.
 * Adaptive thinking is intentionally left off: the background proxy is a single
 * round-trip (no token streaming), and a 16K cap keeps responses within the
 * proxy timeout. Add `thinking: { type: 'adaptive' }` if deeper reasoning is wanted.
 */
const DEFAULT_MODEL = 'claude-opus-4-8';

/**
 * Claude provider using the official Anthropic SDK.
 *
 * Every request goes through `proxyFetch`, which tunnels the SDK's HTTP calls
 * through the background CORS proxy (the iframe cannot fetch api.anthropic.com
 * directly). `dangerouslyAllowBrowser` is required for the iframe context; the
 * API key is user-supplied and stored locally, same trust model as before.
 */
export class AnthropicProvider implements AIProvider {
    name = 'anthropic';
    displayName = 'Claude (Anthropic)';

    private client(apiKey: string): Anthropic {
        return new Anthropic({ apiKey, dangerouslyAllowBrowser: true, fetch: proxyFetch });
    }

    async sendMessage(
        prompt: string,
        apiKey: string,
        options?: { baseUrl?: string, modelName?: string },
        onProgress?: (chunk: string) => void
    ): Promise<string> {
        const response = await this.client(apiKey).messages.create({
            model: options?.modelName || DEFAULT_MODEL,
            max_tokens: 16000,
            system: SYSTEM_PROMPT,
            messages: [{ role: 'user', content: prompt }]
        });

        const text = response.content
            .map((block: any) => (block.type === 'text' ? block.text : ''))
            .join('') || 'No response';

        if (onProgress) onProgress(text);
        return text;
    }

    /**
     * Native web search via Claude's server-side `web_search` tool (dynamic
     * filtering variant). Claude issues searches and answers in one turn; if the
     * server-side tool loop pauses, we resume by resending.
     */
    async webSearch(
        query: string,
        apiKey: string,
        options?: { baseUrl?: string, modelName?: string },
        onProgress?: (chunk: string) => void
    ): Promise<string> {
        const client = this.client(apiKey);
        const model = options?.modelName || DEFAULT_MODEL;
        const tools: any[] = [{ type: 'web_search_20260209', name: 'web_search' }];
        const messages: any[] = [{ role: 'user', content: query }];

        let response = await client.messages.create({ model, max_tokens: 16000, system: SYSTEM_PROMPT, messages, tools });

        let guard = 0;
        while (response.stop_reason === 'pause_turn' && guard++ < 5) {
            messages.push({ role: 'assistant', content: response.content });
            response = await client.messages.create({ model, max_tokens: 16000, system: SYSTEM_PROMPT, messages, tools });
        }

        const text = response.content
            .map((block: any) => (block.type === 'text' ? block.text : ''))
            .join('') || 'No response';

        if (onProgress) onProgress(text);
        return text;
    }

    async getModels(apiKey: string, options?: { baseUrl?: string, type?: 'chat' | 'image' }): Promise<any[]> {
        // Anthropic has no image-generation models.
        if (!apiKey || options?.type === 'image') return [];
        try {
            const models: any[] = [];
            // models.list() auto-paginates; iterate the page directly.
            for await (const m of this.client(apiKey).models.list()) {
                models.push({
                    id: m.id,
                    provider: 'Anthropic',
                    pricing: '',
                    tags: []
                });
            }
            return models;
        } catch (e) {
            console.error('Failed to fetch Anthropic models', e);
            return [];
        }
    }
}
