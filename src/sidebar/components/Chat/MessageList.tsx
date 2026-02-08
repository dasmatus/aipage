import React, { useEffect, useRef } from 'react';
import { marked } from 'marked';
import { Message } from '../../types';
import { Button } from '../ui/button';
import { cn } from '../../lib/utils';
import { Bot, User, Sparkles } from 'lucide-react';
import { t } from '../../i18n';

interface MessageListProps {
    messages: Message[];
    onActionClick?: (action: string) => void;
    disableActions?: boolean;
    userInitials?: string;
    language: string;
}

marked.setOptions({
    gfm: true,
    breaks: true
});

export const MessageList: React.FC<MessageListProps> = ({ messages, onActionClick, disableActions, userInitials, language }) => {
    const bottomRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);
    
    // Helper component for async markdown
    const MarkdownContent = ({ content, role }: { content: string, role: string }) => {
        const [html, setHtml] = React.useState('');

        useEffect(() => {
            Promise.resolve(marked.parse(content)).then(h => setHtml(h));
        }, [content]);

        return (
            <div 
                className={cn(
                    "prose prose-sm max-w-none dark:prose-invert break-words",
                    "text-sm leading-relaxed",
                    role === 'user' ? "text-primary-foreground" : "text-foreground",
                    "[&_p]:mb-2 [&_p:last-child]:mb-0",
                    "[&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5",
                    "[&_code]:bg-muted [&_code]:px-1 [&_code]:rounded [&_code]:font-mono",
                    "[&_pre]:bg-muted [&_pre]:p-3 [&_pre]:rounded-lg [&_pre]:overflow-x-auto [&_pre]:mb-2"
                )}
                dangerouslySetInnerHTML={{ __html: html }} 
            />
        );
    };

    return (
        <div className="flex-1 overflow-y-auto px-4 py-6 space-y-6 scroll-smooth" id="chat-history">
            {messages.map((msg) => (
                <div key={msg.id} className={cn(
                    "flex gap-3 max-w-[90%] animate-in fade-in slide-in-from-bottom-2 duration-300",
                    msg.role === 'user' ? "ml-auto flex-row-reverse" : "mr-auto"
                )}>
                    <div 
                        className={cn(
                            "w-8 h-8 rounded-full flex items-center justify-center shrink-0 shadow-sm",
                            msg.role === 'user' ? "bg-primary text-primary-foreground" : "bg-muted text-foreground border border-border"
                        )}
                        aria-label={msg.role === 'user' ? t('user', language) : t('ai', language)}
                        data-testid={`avatar-${msg.role}`}
                    >
                        {msg.role === 'user' ? (
                            userInitials ? <span className="text-[10px] font-bold">{userInitials}</span> : <User className="w-4 h-4" />
                        ) : (
                            <Bot className="w-4 h-4" aria-hidden="true" />
                        )}
                    </div>
                    
                    <div className="flex flex-col gap-2 min-w-0">
                        <div className={cn(
                            "px-4 py-3 rounded-2xl shadow-sm border",
                            msg.role === 'user' 
                                ? "bg-primary text-primary-foreground border-primary/20 rounded-tr-none" 
                                : "bg-card text-foreground border-border rounded-tl-none"
                        )}>
                            <MarkdownContent content={msg.content} role={msg.role} />
                        </div>
                        
                        {msg.actions && (
                            <div className="flex flex-wrap gap-2 mt-1 px-1">
                                {msg.actions.map((act, idx) => (
                                    <Button
                                        key={idx}
                                        variant={act.primary ? "default" : "outline"}
                                        size="sm"
                                        className={cn(
                                            "h-7 text-[10px] font-bold py-1",
                                            act.primary && "shadow-lg shadow-primary/20"
                                        )}
                                        onClick={() => onActionClick?.(act.action)}
                                        disabled={disableActions}
                                    >
                                        {act.primary && <Sparkles className="w-3 h-3 mr-1" />}
                                        {act.label}
                                    </Button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            ))}
            <div ref={bottomRef} className="h-4" />
        </div>
    );
};
