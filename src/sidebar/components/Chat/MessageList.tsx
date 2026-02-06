import React, { useEffect, useRef } from 'react';
import { marked } from 'marked';
import { Message } from '../../types';

interface MessageListProps {
    messages: Message[];
    onActionClick?: (action: string) => void;
    disableActions?: boolean;
}

marked.setOptions({
    gfm: true,
    breaks: true
});

export const MessageList: React.FC<MessageListProps> = ({ messages, onActionClick, disableActions }) => {
    const bottomRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const renderMarkdown = (text: string) => {
        // Synchronous parse if possible, or handle promise
        // For simplicity in this step, we assume marked returns string or we handle promise elsewhere
        // But marked 4+ can be async. Let's use a simple wrapper or assumption for now (Typescript might complain)
        const result = marked.parse(text);
        // If it's a promise (async), we might need a separate component or state.
        // For now, let's cast to string if we know we aren't using async extensions, OR handle it properly.
        // Actually, let's just cast for now as standard usage without async extensions is sync-ish or returns string in older versions
        // But marked 11+ returns string | Promise<string>.
        return Promise.resolve(result); 
    };
    
    // Helper component for async markdown
    const MarkdownContent = ({ content }: { content: string }) => {
        const [html, setHtml] = React.useState('');

        useEffect(() => {
            Promise.resolve(marked.parse(content)).then(h => setHtml(h));
        }, [content]);

        return <div className="content" dangerouslySetInnerHTML={{ __html: html }} />;
    };

    return (
        <div className="chat-history" id="chat-history">
            {messages.map((msg) => (
                <div key={msg.id} className={`message ${msg.role}`}>
                    <div className="avatar">{msg.role === 'user' ? 'U' : 'AI'}</div>
                    <div style={{ flex: 1 }}>
                        <MarkdownContent content={msg.content} />
                        {msg.actions && (
                            <div className="context-actions" style={{ marginTop: '8px', display: 'flex', gap: '8px' }}>
                                {msg.actions.map((act, idx) => (
                                    <button
                                        key={idx}
                                        className={`action-btn ${act.primary ? 'primary-btn' : 'secondary-btn'}`}
                                        data-action={act.action}
                                        style={{ fontSize: '12px', padding: '4px 8px', cursor: 'pointer' }}
                                        onClick={() => onActionClick?.(act.action)}
                                        disabled={disableActions}
                                    >
                                        {act.label}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            ))}
            <div ref={bottomRef} />
        </div>
    );
};
