export type Role = 'user' | 'ai';

export interface Message {
    id: string;
    role: Role;
    content: string;
    timestamp: number;
    actions?: ContextAction[];
}

export interface ContextAction {
    label: string;
    action: string; // 'answer' | 'summarize'
    primary: boolean;
}

export { ProviderType } from './providers';

export interface ChatState {
    messages: Message[];
    isTyping: boolean;
}

export interface PageContentResponse {
    content: string | null;
    isSelection?: boolean;
    images?: string[];
    error?: string;
}
