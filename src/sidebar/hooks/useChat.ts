import { useState, useCallback } from 'react';
import { Message, ProviderType, Role } from '../types';
import { getProvider } from '../providers';

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
        addMessage('ai', 'Rozmýšľam...');

        try {
            const provider = getProvider(providerType);
            let response = '';

            await provider.sendMessage(text, apiKey || '', options, (chunk) => {
                response += chunk;
                updateLastMessage(response);
            });
            
            // Final update to ensure consistency
            updateLastMessage(response);

        } catch (error) {
            console.error('AI Error:', error);
            updateLastMessage(`Chyba: ${(error as Error).message}`);
        } finally {
            setIsTyping(false);
        }
    };

    const handlePageContext = (content: string) => {
        setLastPageContext(content);
        const isQuestion = isQuestionLike(content);
        
        const action = isQuestion ? 'answer' : 'summarize';
        const label = isQuestion ? 'Odpovedať na otázku' : 'Zhrnúť obsah';
        
        const actions = [
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
        if (text.match(/^\d+\./m)) return true;
        return false;
    };

    const generatePromptFromAction = (action: string) => {
        if (action === 'answer') {
            return `Context: \`\`\`${lastPageContext}\`\`\`\n\nQuestion: Based on the context above, provide the correct answer or solution. Answer in Slovak. Explain briefly.`;
        } else {
            return `Context: \`\`\`${lastPageContext}\`\`\`\n\nTask: Summarize the key points of this page content in Slovak. Use bullet points.`;
        }
    };

    return {
        messages,
        isTyping,
        sendMessage,
        handlePageContext,
        generatePromptFromAction
    };
};
