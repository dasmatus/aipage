import React, { useEffect, useRef, useState } from 'react';
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

const MarkdownContent = ({ content, role }: { content: string, role: 'user' | 'ai' }) => {
    const [html, setHtml] = useState(content);

    useEffect(() => {
        Promise.resolve(marked.parse(content)).then(h => setHtml(h));
    }, [content]);

    return (
        <div
            className={cn(
                "prose prose-sm max-w-none break-words",
                "text-[13px] leading-relaxed",
                "[&_p]:mb-2 [&_p:last-child]:mb-0",
                "[&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5",
                "[&_code]:bg-black/10 [&_code]:px-1 [&_code]:rounded [&_code]:font-mono",
                "[&_pre]:p-3 [&_pre]:rounded-xl [&_pre]:overflow-x-auto [&_pre]:mb-2 [&_pre]:text-[12px]"
            )}
            dangerouslySetInnerHTML={{ __html: html }}
        />
    );
};

export const MessageList: React.FC<MessageListProps> = ({ messages, onActionClick, disableActions, userInitials, language }) => {
    const bottomRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    return (
        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-3 scroll-smooth" id="chat-history">
            {messages.map((msg) => (
                <div key={msg.id} className={cn(
                    "flex gap-2.5 max-w-[92%] animate-in fade-in slide-in-from-bottom-2 duration-200",
                    msg.role === 'user' ? "ml-auto flex-row-reverse" : "mr-auto"
                )}>
                    {/* Avatar */}
                    <div
                        className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
                        style={{ background: msg.role === 'user' ? 'var(--avatar-user-bg)' : 'var(--avatar-ai-bg)' }}
                        aria-label={msg.role === 'user' ? t('user', language) : t('ai', language)}
                        data-testid={`avatar-${msg.role}`}
                    >
                        {msg.role === 'user' ? (
                            userInitials
                                ? <span className="text-[10px] font-bold text-white">{userInitials}</span>
                                : <User className="w-3.5 h-3.5 text-white" />
                        ) : (
                            <Bot className="w-3.5 h-3.5 text-white" aria-hidden="true" />
                        )}
                    </div>

                    {/* Bubble + actions */}
                    <div className="flex flex-col gap-1.5 min-w-0">
                        <div
                            className={cn(
                                "px-3.5 py-2.5 shadow-sm border text-sm leading-relaxed",
                                msg.role === 'user'
                                    ? "rounded-[16px_16px_4px_16px] text-white"
                                    : "rounded-[16px_16px_16px_4px]"
                            )}
                            style={{
                                background: msg.role === 'user'
                                    ? 'var(--message-user-bg)'
                                    : 'var(--message-ai-bg)',
                                borderColor: 'var(--border-color)',
                                backdropFilter: msg.role === 'ai' ? 'var(--backdrop-blur)' : undefined,
                                color: msg.role === 'ai' ? 'var(--text-color)' : undefined,
                            }}
                        >
                            <MarkdownContent content={msg.content} role={msg.role} />
                            {msg.imageUrl && (
                                <a href={msg.imageUrl} target="_blank" rel="noopener noreferrer" className="block mt-2">
                                    <img
                                        src={msg.imageUrl}
                                        alt={msg.content}
                                        className="rounded-xl max-w-full max-h-64 object-contain border border-border/30 hover:opacity-90 transition-opacity"
                                    />
                                </a>
                            )}
                        </div>

                        {msg.actions && (
                            <div className="flex flex-wrap gap-1.5 mt-0.5 px-1">
                                {msg.actions.map((act, idx) => (
                                    <Button
                                        key={idx}
                                        variant={act.primary ? "default" : "outline"}
                                        size="sm"
                                        className={cn(
                                            "h-7 text-[11px] font-semibold py-1 rounded-full cursor-pointer",
                                            act.primary && "shadow-md"
                                        )}
                                        style={act.primary ? { background: 'var(--message-user-bg)', color: 'white', borderColor: 'transparent' } : undefined}
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
            <div ref={bottomRef} className="h-3" />
        </div>
    );
};
