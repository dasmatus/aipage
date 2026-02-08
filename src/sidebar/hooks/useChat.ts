import { useState, useCallback } from 'react';
import { Message, ProviderType, Role } from '../types';
import { getProvider } from '../providers';
import { streamText } from 'ai';
import { createVercelModel } from '../vercel-providers';
import * as Storage from '../storage';
import browser from 'webextension-polyfill';

// Fallback type if ai package doesn't export it in this version
type CoreMessage = {
    role: 'system' | 'user' | 'assistant' | 'tool';
    content: string;
};

export const useChat = () => {
    const [messages, setMessages] = useState<Message[]>([
        { id: 'init', role: 'ai', content: 'Ahoj! Ako ti môžem dnes pomôcť so štúdiom?', timestamp: Date.now() }
    ]);
    const [isTyping, setIsTyping] = useState(false);
    const [lastPageContext, setLastPageContext] = useState('');

    const addMessage = (role: Role, content: string, actions?: any[]) => {
        const msg: Message = {
            id: Date.now().toString() + Math.random(),
            role,
            content,
            timestamp: Date.now(),
            actions
        };
        setMessages(prev => [...prev, msg]);
        return msg;
    };

    const updateLastMessage = (content: string) => {
        setMessages(prev => {
            const newMsgs = [...prev];
            if (newMsgs.length > 0) {
                newMsgs[newMsgs.length - 1].content = content;
            }
            return newMsgs;
        });
    };

    const sendMessage = async (
        text: string, 
        providerType: ProviderType, 
        apiKey: string | null, 
        options?: { baseUrl?: string, modelName?: string }
    ) => {
        if (!text || (!apiKey && providerType !== 'lmstudio' && providerType !== 'ollama')) return;

        addMessage('user', text);
        setIsTyping(true);
        addMessage('ai', 'Rozmýšľam...'); // Initial placeholder
        
        try {
            // Check backend preference
            const backendPref = await Storage.getProviderBackendPreference();
            
            if (backendPref === 'vercel') {
                console.log('Using Vercel AI SDK Backend');
                // Use Vercel AI SDK
                const model = createVercelModel(providerType, apiKey || '', options);
                
                // Convert messages to CoreMessage[]
                // We need to exclude the placeholder 'ai' message we just added (last one)
                // And filter out messages without content or invalid roles if necessary
                const validMessages: CoreMessage[] = messages.map(m => ({
                    role: m.role === 'ai' ? 'assistant' : 'user',
                    content: m.content
                }));
                // Add current user message
                validMessages.push({ role: 'user', content: text });

                const { textStream } = streamText({
                    model,
                    messages: validMessages as any,
                });

                let fullResponse = '';
                for await (const textPart of textStream) {
                    fullResponse += textPart;
                    updateLastMessage(fullResponse);
                }
                
                // Final update
                updateLastMessage(fullResponse);

            } else {
                // Legacy Standard Backend
                const provider = getProvider(providerType);
                let response = '';

                // Note: The legacy sendMessage doesn't usually take full history, just prompt 
                // but providers.ts implementation handles just the prompt string.
                // We might want to pass full history if providers supported it.
                await provider.sendMessage(text, apiKey || '', options, (chunk) => {
                    // Legacy chunk handling (often just full text at end)
                     // If it's a true chunk, we append. If it's full text re-sent, we replace.
                     // provider.sendMessage in providers.ts seems to do: if (onProgress) onProgress(text);
                     // where text is the FULL response.
                     // So we should probably just set it. 
                     // BUT, in providers.ts, performRequest might return full text.
                     // Let's assume standard behavior:
                     response = chunk; // In legacy, chunk IS the full text so far or final text
                     updateLastMessage(response);
                });
                
                updateLastMessage(response);
            }

        } catch (error) {
            console.error('AI Error:', error);
            updateLastMessage(`Chyba: ${(error as Error).message}`);
        } finally {
            setIsTyping(false);
        }
    };

    const handlePageContext = (content: string, isSelection: boolean = false) => {
        setLastPageContext(content);
        const isQuestion = isQuestionLike(content);
        
        let actions: any[] = []; // Fix: define explicit type for actions

        if (isSelection) {
            // Context is just the selection
            if (isQuestion) {
                 actions = [
                    { label: 'Odpovedať', action: 'answer_selection', primary: true },
                    { label: 'Vyhľadať web', action: 'search_web', primary: false }
                 ];
                 const msg = `💡 Našiel som otázku vo výbere:\n"${content.substring(0, 100)}..."\n\nAko chceš postupovať?`;
                 addMessage('ai', msg, actions);
                 return;
            } else {
                 actions = [
                    { label: 'Vysvetliť', action: 'explain_selection', primary: true },
                    { label: 'Zhrnúť', action: 'summarize_selection', primary: false }
                 ];
                 const msg = `📝 Mám text výberu (${content.length} znakov). Čo s ním?`;
                 addMessage('ai', msg, actions);
                 return;
            }
        }
        
        // Full page context
        const action = isQuestion ? 'answer' : 'summarize';
        const label = isQuestion ? 'Odpovedať na otázku' : 'Zhrnúť obsah';
        
        actions = [
             { label, action, primary: true },
        ];
        if (isQuestion) {
            actions.push({ label: 'Zhrnúť stránku', action: 'summarize', primary: false });
        }

        addMessage('ai', `✅ Načítal som obsah stránky (${content.length} znakov). Čo s ním mám spraviť?`, actions);
    };

    const isQuestionLike = (text: string): boolean => {
        if (text.length < 1000 && (text.includes('?') || text.includes('Otázka'))) return true;
        if (text.includes('Vyberte správnu') || text.includes('Určite')) return true;
        
        // Heuristics for question words at start (Slovak/English)
        const questionWords = /^(who|what|where|when|why|how|ako|prečo|kde|kedy|koľko|čom|aký|aká|aké)\s/i;
        if (questionWords.test(text)) return true;

        if (text.match(/^\d+\./m)) return true;
        return false;
    };

    const generatePromptFromAction = (action: string) => {
        switch (action) {
            case 'answer':
            case 'answer_selection':
                return `Context: \`\`\`${lastPageContext}\`\`\`\n\nQuestion: Based on the context above, answer the question or solve the problem. Answer in Slovak. Explain the solution step-by-step if needed.`;
            case 'explain_selection':
                return `Context: \`\`\`${lastPageContext}\`\`\`\n\nTask: Explain this text to me in Slovak. Simplify complex concepts.`;
            case 'summarize_selection':
                return `Context: \`\`\`${lastPageContext}\`\`\`\n\nTask: Summarize this text in Slovak.`;
            case 'summarize':
            default:
                return `Context: \`\`\`${lastPageContext}\`\`\`\n\nTask: Summarize the key points of this page content in Slovak. Use bullet points.`;
        }
    };

    return {
        messages,
        isTyping,
        sendMessage,
        handlePageContext,
        generatePromptFromAction,
        lastPageContext,
        addMessage,
        updateLastMessage,
        setIsTyping
    };
};
