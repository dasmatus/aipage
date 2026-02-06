import React, { useState, useRef, useEffect } from 'react';

interface InputAreaProps {
    onSend: (text: string) => void;
    onScanPage: () => void;
    disabled?: boolean;
    isScanning?: boolean;
}

export const InputArea: React.FC<InputAreaProps> = ({ onSend, onScanPage, disabled, isScanning }) => {
    const [text, setText] = useState('');
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setText(e.target.value);
        autoResize();
    };

    const autoResize = () => {
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    const handleSend = () => {
        if (text.trim() && !disabled) {
            onSend(text.trim());
            setText('');
            if (textareaRef.current) textareaRef.current.style.height = 'auto';
        }
    };

    return (
        <div className="chat-input-area">
            <button 
                id="scan-page-btn" 
                className="icon-btn" 
                title="Analyzovať stránku" 
                style={{ marginRight: '4px', padding: '6px', opacity: isScanning ? 0.5 : 1 }}
                onClick={onScanPage}
                disabled={isScanning || disabled}
            >
                 <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                    <polyline points="14 2 14 8 20 8"></polyline>
                    <line x1="16" y1="13" x2="8" y2="13"></line>
                    <line x1="16" y1="17" x2="8" y2="17"></line>
                    <polyline points="10 9 9 9 8 9"></polyline>
                </svg>
            </button>
            <textarea 
                id="chat-input" 
                ref={textareaRef}
                placeholder="Spýtaj sa na čokoľvek..." 
                rows={1}
                value={text}
                onChange={handleInput}
                onKeyDown={handleKeyDown}
                disabled={disabled}
            />
            <button 
                id="send-btn" 
                disabled={!text.trim() || disabled} 
                onClick={handleSend}
            >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="22" y1="2" x2="11" y2="13"></line>
                    <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                </svg>
            </button>
        </div>
    );
};
