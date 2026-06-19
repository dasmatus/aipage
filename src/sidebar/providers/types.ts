/**
 * AI Provider Types
 */

export type ProviderType = 'anthropic' | 'lmstudio' | 'ollama';

export const SYSTEM_PROMPT = "You are a helpful assistant that answers questions correctly.";

/**
 * Interface that all AI providers must implement.
 */
export interface AIProvider {
    name: string;
    displayName: string;

    /**
     * Sends a message to the AI provider.
     * @param prompt User's message
     * @param apiKey API Key (optional for local)
     * @param options Additional options (baseUrl, modelName)
     * @param onProgress Callback for streaming responses (optional)
     * @returns Full response string
     */
    sendMessage(
        prompt: string, 
        apiKey: string, 
        options?: { baseUrl?: string, modelName?: string },
        onProgress?: (chunk: string) => void
    ): Promise<string>;

    /**
     * Fetches available models from the provider.
     * @param apiKey API Key
     * @param options Base URL override
     */
    getModels?(apiKey: string, options?: { baseUrl?: string, type?: 'chat' | 'image' }): Promise<any[]>;

    /**
     * Optional native web search. Implemented only by providers whose model can
     * search the web itself (Claude's server-side web_search tool). Searches and
     * answers in one call; returns the answer text.
     */
    webSearch?(
        query: string,
        apiKey: string,
        options?: { baseUrl?: string, modelName?: string },
        onProgress?: (chunk: string) => void
    ): Promise<string>;
}
