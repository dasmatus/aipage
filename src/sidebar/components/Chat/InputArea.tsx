import React, { useState, useRef, useEffect } from 'react';

import { t } from '../../i18n';

interface InputAreaProps {
    onSend: (text: string) => void;
    onScanPage: () => void;
    onSearchWeb: (query: string) => void;
    disabled?: boolean;
    isScanning?: boolean;
    language: string;
}

export const InputArea: React.FC<InputAreaProps> = ({ onSend, onScanPage, onSearchWeb, disabled, isScanning, language }) => {
    const [text, setText] = useState('');
    const [isSearchMode, setIsSearchMode] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const searchInputRef = useRef<HTMLInputElement>(null);

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

    const handleToggleSearch = () => {
        setIsSearchMode(!isSearchMode);
        if (isSearchMode) {
            // Closing search mode, clear query
            setSearchQuery('');
        } else {
            // Opening search mode, focus input
            setTimeout(() => searchInputRef.current?.focus(), 100);
        }
    };

    const handleSearchSubmit = () => {
        if (searchQuery.trim()) {
            onSearchWeb(searchQuery.trim());
            setSearchQuery('');
            setIsSearchMode(false);
        }
    };

    const handleSearchKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleSearchSubmit();
        } else if (e.key === 'Escape') {
            setIsSearchMode(false);
            setSearchQuery('');
        }
    };

    return (
        <div className="chat-input-area">
            <div style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
                <div style={{ display: 'flex', alignItems: 'center', padding: '0 4px', marginBottom: '4px' }}>
                    <button 
                        id="scan-page-btn" 
                        className="icon-btn" 
                        title={t('analyzePage', language)} 
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
                    
                    <button 
                        id="search-web-btn" 
                        className={`icon-btn ${isSearchMode ? 'active' : ''}`}
                        title={isSearchMode ? "Close Search" : "Search Web"}
                        style={{ padding: '6px', opacity: isSearchMode ? 1 : 0.7 }}
                        onClick={handleToggleSearch}
                        disabled={disabled}
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="11" cy="11" r="8"></circle>
                            <path d="m21 21-4.35-4.35"></path>
                        </svg>
                    </button>
                </div>

                {isSearchMode && (
                    <div style={{ display: 'flex', width: '100%', alignItems: 'center', marginBottom: '8px', padding: '0 4px' }}>
                        <input
                            ref={searchInputRef}
                            type="text"
                            id="search-input"
                            placeholder="Enter search query..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            onKeyDown={handleSearchKeyDown}
                            disabled={disabled}
                            style={{ 
                                flexGrow: 1, 
                                padding: '8px',
                                border: '1px solid var(--border-color)',
                                borderRadius: '4px',
                                marginRight: '4px'
                            }}
                        />
                        <button
                            onClick={handleSearchSubmit}
                            disabled={!searchQuery.trim() || disabled}
                            style={{ padding: '8px 16px' }}
                        >
                            Search
                        </button>
                    </div>
                )}

                <div style={{ display: 'flex', width: '100%', alignItems: 'flex-end' }}>
                    <textarea 
                        id="chat-input" 
                        ref={textareaRef}
                        placeholder={t('askAnything', language)} 
                        rows={1}
                        value={text}
                        onChange={handleInput}
                        onKeyDown={handleKeyDown}
                        disabled={disabled}
                        style={{ flexGrow: 1 }}
                    />
                    <button 
                        id="send-btn"
                        title={t('send', language)}
                        aria-label={t('send', language)} 
                        disabled={!text.trim() || disabled} 
                        onClick={handleSend}
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <line x1="22" y1="2" x2="11" y2="13"></line>
                            <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                        </svg>
                    </button>
                </div>
            </div>
        </div>
    );
};
