
/**
 * Vercel AI SDK Integration
 * 
 * This module creates a bridge between our app's ProviderType and Vercel AI SDK.
 * Since we only have the 'ai' package and not the provider packages (e.g. @ai-sdk/openai),
 * we must implement the provider interfaces using our existing fetch primitives or 
 * create a Custom Language Model that wraps our existing providers.
 * 
 * Vercel AI SDK 3.0+ uses the LanguageModelV1 interface.
 */

import { ProviderType } from './types';
import { getProvider } from './providers';

/**
 * A custom LanguageModelV1 implementation that wraps our existing legacy providers.
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
        // But for completeness we could implement non-streaming here
        // For now, reuse stream implementation and gather it
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
        const messages = options.inputMessages;
        const lastMessage = messages[messages.length - 1];
        
        // Construct prompt history
        // Our legacy helper usually takes just the last prompt or builds it internally.
        // But for better compat, we should reconstruct the "prompt" string if our provider expects it,
        // OR update our providers to accept messages.
        // Current providers.ts `sendMessage` takes `prompt: string`.
        // We will just use the last user message text for now, as our legacy providers often prepend system prompt themselves.
        
        let promptText = '';
        if (lastMessage.content && Array.isArray(lastMessage.content)) {
            promptText = lastMessage.content.map((c: any) => c.text || '').join('');
        } else if (typeof lastMessage.content === 'string') {
            promptText = lastMessage.content;
        }

        const legacyProvider = getProvider(this.providerType);
        
        const stream = new ReadableStream<any>({
            start: async (controller: any) => {
                try {
                    // We use the onProgress callback to simulate streaming
                    const fullResponse = await legacyProvider.sendMessage(
                        promptText,
                        this.apiKey,
                        this.options,
                        (chunk) => {
                             // This 'chunk' in our legacy system is actually the ACCUMULATED text so far,
                             // NOT a delta. Vercel AI SDK expects deltas.
                             // This is a mismatch. Our legacy providers don't really stream deltas properly yet,
                             // they mock it or just wait.
                             // Actually, let's look at providers.ts... 
                             // It does: `if (onProgress) onProgress(text);` at the END.
                             // So it is NOT true streaming. It waits for full response then emits it.
                        }
                    );

                    // Since our legacy providers are not true streams, we just emit the full text as one delta
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
