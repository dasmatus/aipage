/**
 * AI Provider Types
 */

export type ProviderType = 'gemini' | 'openai' | 'claude' | 'mistral' | 'lmstudio' | 'ollama' | 'vercel';

export const SYSTEM_PROMPT = "You are a helpful assistant that answers questions correctly.";

/**
 * Interface that all AI providers must implement.
 */
export interface AIProvider {
    name: string;
    displayName: string;
    /**
     * Sends a prompt to the AI provider and returns the response.
     * @param prompt The user's input text
     * @param apiKey API key for authentication (optional for local providers)
     * @param options Additional configuration like baseUrl or modelName
     * @param onProgress Optional callback for streaming tokens (not supported by all providers)
     */
    sendMessage(
        prompt: string, 
        apiKey: string, 
        options?: { baseUrl?: string, modelName?: string },
        onProgress?: (chunk: string) => void
    ): Promise<string>;
    
    /**
     * Fetches available models from the provider (if supported).
     * Returns an array of model objects { id: string, pricing?: string, tags?: string[] }.
     */
    getModels?(apiKey: string, options?: { baseUrl?: string }): Promise<any[]>;
}
