import { AIProvider, SYSTEM_PROMPT } from './types';
import { performRequest } from './utils';

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
        let url = options?.baseUrl || 'https://ai-gateway.vercel.sh/v1';
        if (url.endsWith('/')) url = url.slice(0, -1);
        if (url.endsWith('/models')) url = url.slice(0, -7);
        if (!url.endsWith('/chat/completions')) url = `${url}/chat/completions`;

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

    async getModels(apiKey: string, options?: { baseUrl?: string, type?: 'chat' | 'image' }): Promise<any[]> {
        let url = options?.baseUrl || 'https://ai-gateway.vercel.sh/v1/models';
        if (url.endsWith('/')) url = url.slice(0, -1);
        if (!url.endsWith('/models')) url = `${url}/models`;

        try {
            const data = await performRequest(url, 'GET', {
                'Authorization': `Bearer ${apiKey}`
            });
            // Robustly extract model list from various common API formats
            const modelData = Array.isArray(data.data)
                ? data.data
                : (Array.isArray(data.models)
                    ? data.models
                    : (Array.isArray(data) ? data : []));

            const models = modelData
                .filter((m: any) => m && m.id)
                .map((m: any) => {
                    let provider = 'other';
                    if (m.id.includes(':')) {
                        provider = m.id.split(':')[0];
                    } else if (m.id.includes('/')) {
                        provider = m.id.split('/')[0];
                    }

                    const pricingLabel = (m.pricing && m.pricing.prompt !== undefined)
                        ? `${m.pricing.input}/${m.pricing.output} (1M)`
                        : '';

                    return {
                        id: m.id,
                        provider: provider.charAt(0).toUpperCase() + provider.slice(1),
                        pricing: pricingLabel,
                        tags: m.tags || []
                    };
                });

            const filtered = options?.type === 'chat'
                ? models.filter((m: any) => isChatModel(m.id))
                : options?.type === 'image'
                ? models.filter((m: any) => isImageGenModel(m.id))
                : models;

            // Sort by provider, then tagged-first, then id
            return filtered.sort((a: any, b: any) => {
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

// ─── Model classification helpers ────────────────────────────────────────────

function isImageGenModel(id: string): boolean {
    const lower = id.toLowerCase();
    return (
        lower.includes('dall-e') ||
        lower.includes('dall_e') ||
        lower.includes('stable-diffusion') ||
        lower.includes('stable_diffusion') ||
        lower.includes('sdxl') ||
        lower.includes('flux') ||
        lower.includes('imagen') ||
        lower.includes('midjourney') ||
        lower.includes('kandinsky') ||
        lower.includes('wuerstchen') ||
        lower.startsWith('fal-ai:') ||
        lower.startsWith('stability-ai:')
    );
}

function isEmbeddingModel(id: string): boolean {
    return id.toLowerCase().includes('embed');
}

function isAudioModel(id: string): boolean {
    const lower = id.toLowerCase();
    return (
        lower.includes('whisper') ||
        lower.startsWith('openai:tts') ||
        lower.includes('-tts-') ||
        lower.includes(':speech')
    );
}

function isModerationModel(id: string): boolean {
    return id.toLowerCase().includes('moderation');
}

function isChatModel(id: string): boolean {
    return !isImageGenModel(id) && !isEmbeddingModel(id) && !isAudioModel(id) && !isModerationModel(id);
}
