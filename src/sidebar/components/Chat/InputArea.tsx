import React, { useState, useRef } from 'react';
import { t } from '../../i18n';
import { FileText, Search, Send, X, Loader2, ImageIcon } from 'lucide-react';

interface InputAreaProps {
    onSend: (text: string) => void;
    onScanPage: () => void;
    onSearchWeb: (query: string) => void;
    onGenerateImage: (prompt: string) => void;
    disabled?: boolean;
    isScanning?: boolean;
    language: string;
    exaEnabled: boolean;
    imageGenEnabled: boolean;
}


export const InputArea: React.FC<InputAreaProps> = ({ onSend, onScanPage, onSearchWeb, onGenerateImage, disabled, isScanning, language, exaEnabled, imageGenEnabled }) => {
    const [text, setText] = useState('');
    const [isSearchMode, setIsSearchMode] = useState(false);
    const [isImageMode, setIsImageMode] = useState(false);
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
            if (isImageMode) {
                onGenerateImage(text.trim());
            } else {
                onSend(text.trim());
            }
            setText('');
            if (textareaRef.current) textareaRef.current.style.height = 'auto';
        }
    };

    const handleToggleSearch = () => {
        const nextMode = !isSearchMode;
        setIsSearchMode(nextMode);
        if (nextMode) setIsImageMode(false);
        if (!nextMode) {
            setSearchQuery('');
        } else {
            setTimeout(() => searchInputRef.current?.focus(), 100);
        }
    };

    const handleToggleImageMode = () => {
        const next = !isImageMode;
        setIsImageMode(next);
        if (next) {
            setIsSearchMode(false);
            setSearchQuery('');
        }
        setTimeout(() => textareaRef.current?.focus(), 50);
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
        <div
            className="px-3 py-2.5 border-t space-y-2.5 animate-in fade-in slide-in-from-bottom-4 duration-500 backdrop-blur-md"
            style={{ background: 'var(--header-bg)', borderColor: 'var(--border-color)' }}
        >
            {/* Toolbar */}
            <div className="flex items-center gap-1">
                <button
                    className="h-7 w-7 rounded-lg flex items-center justify-center transition-colors cursor-pointer"
                    style={{ color: 'var(--secondary-text)' }}
                    title={t('analyzePage', language)}
                    onClick={onScanPage}
                    disabled={isScanning || disabled}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,0,0,0.06)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                    {isScanning
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" style={{ color: 'var(--accent-color)' }} />
                        : <FileText className="h-3.5 w-3.5" />}
                </button>

                {exaEnabled && (
                    <button
                        className="h-7 w-7 rounded-lg flex items-center justify-center transition-colors cursor-pointer"
                        style={{
                            color: isSearchMode ? 'var(--accent-color)' : 'var(--secondary-text)',
                            background: isSearchMode ? 'color-mix(in srgb, var(--accent-color) 12%, transparent)' : 'transparent',
                        }}
                        title={isSearchMode ? t('closeSearch', language) : t('searchWeb', language)}
                        onClick={handleToggleSearch}
                        disabled={disabled}
                    >
                        {isSearchMode ? <X className="h-3.5 w-3.5" /> : <Search className="h-3.5 w-3.5" />}
                    </button>
                )}

                {imageGenEnabled && (
                    <button
                        className="h-7 w-7 rounded-lg flex items-center justify-center transition-colors cursor-pointer"
                        style={{
                            color: isImageMode ? 'var(--accent-color)' : 'var(--secondary-text)',
                            background: isImageMode ? 'color-mix(in srgb, var(--accent-color) 12%, transparent)' : 'transparent',
                        }}
                        title={t('imageGen', language)}
                        onClick={handleToggleImageMode}
                        disabled={disabled}
                    >
                        <ImageIcon className="h-3.5 w-3.5" />
                    </button>
                )}

                {isSearchMode && (
                    <div className="flex-1 flex gap-1.5 animate-in slide-in-from-left-2 fade-in duration-200">
                        <input
                            ref={searchInputRef}
                            id="search-input"
                            placeholder={t('searchPlaceholder', language)}
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            onKeyDown={handleSearchKeyDown}
                            disabled={disabled}
                            className="flex-1 h-7 text-xs rounded-lg px-2.5 outline-none"
                            style={{ background: 'var(--input-bg)', border: '1px solid var(--border-color)', color: 'var(--text-color)' }}
                        />
                        <button
                            className="h-7 px-2.5 text-[11px] font-bold rounded-lg text-white cursor-pointer disabled:opacity-50"
                            style={{ background: 'var(--message-user-bg)' }}
                            onClick={handleSearchSubmit}
                            disabled={!searchQuery.trim() || disabled}
                        >
                            {t('search', language)}
                        </button>
                    </div>
                )}
            </div>

            {/* Input row */}
            <div className="flex items-end gap-2">
                <textarea
                    id="chat-input"
                    ref={textareaRef}
                    placeholder={isImageMode ? t('imageGenPromptPlaceholder', language) : t('askAnything', language)}
                    rows={1}
                    value={text}
                    onChange={handleInput}
                    onKeyDown={handleKeyDown}
                    disabled={disabled}
                    className="flex-1 min-h-[38px] max-h-[150px] rounded-xl px-3.5 py-2.5 text-[13px] resize-none outline-none transition-all duration-200"
                    style={{
                        background: 'var(--input-bg)',
                        border: '1px solid var(--border-color)',
                        color: 'var(--text-color)',
                        backdropFilter: 'var(--backdrop-blur)',
                        opacity: disabled ? 0.5 : 1,
                    }}
                    onFocus={e => { e.currentTarget.style.borderColor = 'var(--accent-color)'; e.currentTarget.style.boxShadow = '0 0 0 3px color-mix(in srgb, var(--accent-color) 12%, transparent)'; }}
                    onBlur={e => { e.currentTarget.style.borderColor = 'var(--border-color)'; e.currentTarget.style.boxShadow = 'none'; }}
                />
                <button
                    id="send-btn"
                    className="h-[38px] w-[38px] rounded-xl shrink-0 flex items-center justify-center text-white transition-all duration-150 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{
                        background: text.trim() ? 'var(--message-user-bg)' : 'var(--border-color)',
                        transform: text.trim() ? 'scale(1)' : 'scale(0.95)',
                        boxShadow: text.trim() ? '0 4px 14px color-mix(in srgb, var(--accent-color) 28%, transparent)' : 'none',
                    }}
                    title={t('send', language)}
                    aria-label={t('send', language)}
                    disabled={!text.trim() || disabled}
                    onClick={handleSend}
                >
                    {isImageMode
                        ? <ImageIcon className="h-4 w-4" />
                        : <Send className="h-4 w-4" />
                    }
                </button>
            </div>
        </div>
    );
};
