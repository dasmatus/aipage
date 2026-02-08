export * from './types';
export * from './utils';
export * from './lmstudio';
export * from './ollama';
export * from './vercel';

import { AIProvider, ProviderType } from './types';
import { LMStudioProvider } from './lmstudio';
import { OllamaProvider } from './ollama';
import { VercelSDKProvider } from './vercel';

const providers: Record<ProviderType, AIProvider> = {
    vercel: new VercelSDKProvider(),
    lmstudio: new LMStudioProvider(),
    ollama: new OllamaProvider()
};

export function getProvider(type: ProviderType): AIProvider {
    return providers[type] || providers['vercel'];
}
