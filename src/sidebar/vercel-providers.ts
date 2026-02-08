
/**
 * Vercel AI SDK 4.x Integration
 * 
 * This module creates a bridge between our app's ProviderType and Vercel AI SDK.
 * Since we only have the 'ai' package and not the provider packages (e.g. @ai-sdk/openai),
 * we must implement the provider interfaces using our existing fetch primitives or 
 * create a Custom Language Model that wraps our existing providers.
 * 
 * Vercel AI SDK 4 (and AI SDK 5) uses the LanguageModelV2 interface.
 */

import { ProviderType } from './types';
import { getProvider } from './providers';

/**
 * A custom LanguageModelV2 implementation that wraps our existing legacy providers.
 * This allows us to use the Vercel AI SDK's high-level features (like streamText)
 * while keeping our existing API calling logic (which is CORS-proxied via background script).
 */
export class LegacyProviderAdapter {
    readonly specificationVersion = 'v1';
    readonly defaultObjectGenerationMode = 'json';
    
    constructor(
        readonly providerId: string,
        readonly providerType: ProviderType,
        readonly apiKey: string,
        readonly options?: { baseUrl?: string, modelName?: string }
    ) {}

    get provider(): string {
        return this.providerType;
    }

    get modelId(): string {
        return this.options?.modelName || this.providerType;
    }

    async doGenerate(options: any): Promise<any> {
        // We only support doStream for now as that's what we primarily use
        const stream = await this.doStream(options);
        const parts: any[] = [];
        
        const reader = stream.stream.getReader();
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value.type === 'text-delta') {
                parts.push({ type: 'text', text: value.textDelta });
            }
        }
        
        return {
            text: parts.map(p => p.text).join(''),
            usage: { promptTokens: 0, completionTokens: 0 },
            finishReason: 'stop',
        };
    }

    async doStream(options: any): Promise<{ stream: ReadableStream<any>, rawCall: { rawPrompt: unknown, rawSettings: unknown }, warnings?: any[] }> {
        // Support both V1 (prompt) and V2 (inputMessages) specifications
        const messages = options.inputMessages || options.prompt || [];
        const lastMessage = messages.length > 0 ? messages[messages.length - 1] : { content: '' };
        
        let promptText = '';
        if (lastMessage.content && Array.isArray(lastMessage.content)) {
            promptText = lastMessage.content.map((c: any) => (typeof c === 'string' ? c : c.text || '')).join('');
        } else if (typeof lastMessage.content === 'string') {
            promptText = lastMessage.content;
        }

        let actualProviderType = this.providerType;
        
        // If we are using the generic 'vercel' provider, we infer the actual provider logic
        // based on the model name prefix if it follows the 'provider:model' format.
        if (actualProviderType === 'vercel' && this.options?.modelName?.includes(':')) {
            const parts = this.options.modelName.split(':');
            const prefix = parts[0];
            if (['openai', 'claude', 'anthropic', 'mistral', 'gemini', 'google'].includes(prefix)) {
                // Map anthropic -> claude, google -> gemini
                if (prefix === 'anthropic') actualProviderType = 'claude';
                else if (prefix === 'google') actualProviderType = 'gemini';
                else actualProviderType = prefix as ProviderType;
            }
        }

        const legacyProvider = getProvider(actualProviderType);
        
        const stream = new ReadableStream<any>({
            start: async (controller: any) => {
                try {
                    // We use the onProgress callback to simulate streaming
                    const fullResponse = await legacyProvider.sendMessage(
                        promptText,
                        this.apiKey,
                        this.options,
                        (chunk) => {
                             // This 'chunk' in our legacy system is actually the ACCUMULATED text so far.
                        }
                    );

                    // Since our legacy providers are not true streams yet, we just emit the full text as one delta
                    controller.enqueue({
                        type: 'text-delta',
                        textDelta: fullResponse
                    });
                    
                    controller.enqueue({
                        type: 'finish',
                        finishReason: 'stop',
                        usage: { promptTokens: 0, completionTokens: 0 }
                    });
                    controller.close();
                } catch (error) {
                    controller.error(error);
                }
            }
        });

        return {
            stream,
            rawCall: { rawPrompt: messages, rawSettings: options },
        };
    }
}

/**
 * Creates a Vercel AI SDK compatible model from our legacy configuration.
 */
export function createVercelModel(
    provider: ProviderType, 
    apiKey: string, 
    options?: { baseUrl?: string, modelName?: string }
): any {
    return new LegacyProviderAdapter('custom-legacy', provider, apiKey, options);
}
