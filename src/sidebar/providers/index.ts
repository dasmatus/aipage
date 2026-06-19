export * from './types';
export * from './utils';
export * from './lmstudio';
export * from './ollama';
export * from './anthropic';

import { AIProvider, ProviderType } from './types';
import { LMStudioProvider } from './lmstudio';
import { OllamaProvider } from './ollama';
import { AnthropicProvider } from './anthropic';

const providers: Record<ProviderType, AIProvider> = {
    anthropic: new AnthropicProvider(),
    lmstudio: new LMStudioProvider(),
    ollama: new OllamaProvider()
};

export function getProvider(type: ProviderType): AIProvider {
    return providers[type] || providers['anthropic'];
}
