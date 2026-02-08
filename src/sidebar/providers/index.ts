export * from './types';
export * from './utils';
export * from './gemini';
export * from './openai';
export * from './claude';
export * from './mistral';
export * from './lmstudio';
export * from './ollama';
export * from './vercel';

import { AIProvider, ProviderType } from './types';
import { GeminiProvider } from './gemini';
import { OpenAIProvider } from './openai';
import { ClaudeProvider } from './claude';
import { MistralProvider } from './mistral';
import { LMStudioProvider } from './lmstudio';
import { OllamaProvider } from './ollama';
import { VercelSDKProvider } from './vercel';

/**
 * Global registry of AI providers
 */
export const providers: Record<ProviderType, AIProvider> = {
    gemini: new GeminiProvider(),
    openai: new OpenAIProvider(),
    claude: new ClaudeProvider(),
    mistral: new MistralProvider(),
    lmstudio: new LMStudioProvider(),
    ollama: new OllamaProvider(),
    vercel: new VercelSDKProvider()
};

/**
 * Factory function to retrieve a provider implementation by type.
 */
export function getProvider(type: ProviderType): AIProvider {
    return providers[type];
}
