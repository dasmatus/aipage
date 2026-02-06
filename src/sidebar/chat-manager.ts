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
            let accumulatedResponse = '';

            const response = await provider.sendMessage(text, apiKey || '', options, (chunk) => {
                accumulatedResponse += chunk;
                const result = marked.parse(accumulatedResponse);
                if (result instanceof Promise) {
                    result.then((rendered: string) => {
                        contentArea.innerHTML = rendered;
                        this.scrollToBottom();
                    });
                } else {
                    contentArea.innerHTML = result;
                    this.scrollToBottom();
                }
            });

            // Final Render (ensure consistency)
            const finalResult = marked.parse(response);
            if (finalResult instanceof Promise) {
                finalResult.then((rendered: string) => {
                    contentArea.innerHTML = rendered;
                });
            } else {
                contentArea.innerHTML = finalResult;
            }
        } catch (error) {
            console.error('AI Error:', error);
            contentArea.textContent = `Chyba: ${(error as Error).message}`;
        }

        this.scrollToBottom();
    }

    private lastPageContext: string = '';
    public onUserAction?: (prompt: string) => void;

    /**
     * Analyzes page content and offers actions.
     */
    public async handlePageContext(content: string) {
        this.lastPageContext = content;
        const isQuestion = this.isQuestionLike(content);
        
        const action = isQuestion ? 'answer' : 'summarize';
        const label = isQuestion ? 'Odpovedať na otázku' : 'Zhrnúť obsah';
        
        const actionsHtml = `
            <div class="context-actions" style="margin-top: 8px; display: flex; gap: 8px;">
                <button class="action-btn primary-btn" data-action="${action}" style="font-size: 12px; padding: 4px 8px; cursor: pointer;">
                    ${label}
                </button>
                ${isQuestion ? `
                <button class="action-btn secondary-btn" data-action="summarize" style="font-size: 12px; padding: 4px 8px; cursor: pointer;">
                    Zhrnúť stránku
                </button>` : ''}
            </div>
        `;

        const msgDiv = this.appendMessage('ai', `✅ Načítal som obsah stránky (${content.length} znakov). Čo s ním mám spraviť?`);
        const contentDiv = msgDiv.querySelector('.content') as HTMLElement;
        contentDiv.insertAdjacentHTML('beforeend', actionsHtml);

        // Add listeners
        const buttons = contentDiv.querySelectorAll('.action-btn');
        buttons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const act = (e.currentTarget as HTMLElement).dataset.action;
                this.handleContextAction(act || 'summarize');
                // Disable buttons after click
                buttons.forEach(b => (b as HTMLButtonElement).disabled = true);
            });
        });
    }

    private isQuestionLike(text: string): boolean {
        // Simple heuristics
        if (text.length < 1000 && (text.includes('?') || text.includes('Otázka'))) return true;
        if (text.includes('Vyberte správnu') || text.includes('Určite')) return true;
        if (text.match(/^\d+\./m)) return true; // Numbered list like "1."
        return false;
    }

    private async handleContextAction(action: string) {
        if (!this.lastPageContext || !this.onUserAction) return;

        let prompt = '';
        if (action === 'answer') {
            prompt = `Context: \`\`\`${this.lastPageContext}\`\`\`\n\nQuestion: Based on the context above, provide the correct answer or solution. Answer in Slovak. Explain briefly.`;
        } else {
            prompt = `Context: \`\`\`${this.lastPageContext}\`\`\`\n\nTask: Summarize the key points of this page content in Slovak. Use bullet points.`;
        }

        this.onUserAction(prompt);
    }

    /**
     * Smoothly scrolls the chat history to the bottom.
     */
    public scrollToBottom(): void {
        this.historyContainer.scrollTop = this.historyContainer.scrollHeight;
    }
}
