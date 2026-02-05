/**
 * Chat Manager Module
 * Handles message history, AI communication, and markdown rendering.
 */

import { marked } from 'marked';
import { getProvider, ProviderType } from './providers';

/**
 * Configure marked for GFM and line breaks
 */
marked.setOptions({
    gfm: true,
    breaks: true
});

/**
 * Manages the chat flow and UI interaction
 */
export class ChatManager {
    private historyContainer: HTMLElement;

    constructor(container: HTMLElement) {
        this.historyContainer = container;
    }

    /**
     * Appends a message to the chat container.
     * @param role 'user' | 'ai'
     * @param text The message content
     * @returns The created message element
     */
    public appendMessage(role: 'user' | 'ai', text: string): HTMLElement {
        const msgDiv = document.createElement('div');
        msgDiv.className = `message ${role}`;

        const avatar = document.createElement('div');
        avatar.className = 'avatar';
        avatar.textContent = role === 'user' ? 'U' : 'AI';

        const content = document.createElement('div');
        content.className = 'content';

        if (role === 'user' || text === 'Rozmýšľam...') {
            content.innerText = text;
        } else {
            // Background parse for AI messages
            const result = marked.parse(text);
            if (result instanceof Promise) {
                result.then((rendered: string) => {
                    content.innerHTML = rendered;
                });
            } else {
                content.innerHTML = result;
            }
        }

        msgDiv.appendChild(avatar);
        msgDiv.appendChild(content);

        this.historyContainer.appendChild(msgDiv);
        this.scrollToBottom();
        return msgDiv;
    }

    /**
     * Sends a message using the selected provider and updates the UI.
     * @param text User prompt
     * @param providerType Selected provider
     * @param apiKey API Key for the provider
     * @param options Local settings (url, model)
     */
    public async sendMessage(
        text: string,
        providerType: ProviderType,
        apiKey: string | null,
        options?: { baseUrl?: string, modelName?: string }
    ): Promise<void> {
        const isLocal = providerType === 'lmstudio' || providerType === 'ollama';
        if (!text || (!apiKey && !isLocal)) return;

        // Add User Message
        this.appendMessage('user', text);

        // Placeholder AI Message
        const aiMessageDiv = this.appendMessage('ai', 'Rozmýšľam...');
        const contentArea = aiMessageDiv.querySelector('.content') as HTMLElement;

        try {
            const provider = getProvider(providerType);
            const response = await provider.sendMessage(text, apiKey || '', options);

            // Render Markdown
            const rendered = await marked.parse(response);
            contentArea.innerHTML = rendered;
        } catch (error) {
            console.error('AI Error:', error);
            contentArea.textContent = `Error: ${(error as Error).message}`;
        }

        this.scrollToBottom();
    }

    /**
     * Smoothly scrolls the chat history to the bottom.
     */
    public scrollToBottom(): void {
        this.historyContainer.scrollTop = this.historyContainer.scrollHeight;
    }
}
