import React, { useState, useRef } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { t } from '../../i18n';
import { FileText, Search, Send, X, Loader2, ImageIcon } from 'lucide-react';
import { cn } from '../../lib/utils';

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
        <div className="p-4 border-t bg-card/50 backdrop-blur-sm space-y-3 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex items-center gap-2">
                <Button 
                    variant="ghost" 
                    size="icon" 
                    className={cn("h-8 w-8 rounded-full transition-all duration-300", isScanning && "animate-pulse")}
                    title={t('analyzePage', language)} 
                    onClick={onScanPage}
                    disabled={isScanning || disabled}
                >
                    {isScanning ? <Loader2 className="h-4 w-4 animate-spin text-primary" /> : <FileText className="h-4 w-4" />}
                </Button>
                
                {exaEnabled && (
                    <Button
                        variant={isSearchMode ? "secondary" : "ghost"}
                        size="icon"
                        className={cn("h-8 w-8 rounded-full transition-all duration-300", isSearchMode && "bg-primary/20 text-primary")}
                        title={isSearchMode ? t('closeSearch', language) : t('searchWeb', language)}
                        onClick={handleToggleSearch}
                        disabled={disabled}
                    >
                        {isSearchMode ? <X className="h-4 w-4" /> : <Search className="h-4 w-4 text-muted-foreground" />}
                    </Button>
                )}

                {imageGenEnabled && (
                    <Button
                        variant={isImageMode ? "secondary" : "ghost"}
                        size="icon"
                        className={cn("h-8 w-8 rounded-full transition-all duration-300", isImageMode && "bg-primary/20 text-primary")}
                        title={t('imageGen', language)}
                        onClick={handleToggleImageMode}
                        disabled={disabled}
                    >
                        <ImageIcon className="h-4 w-4" />
                    </Button>
                )}

                {isSearchMode && (
                    <div className="flex-1 flex gap-2 animate-in slide-in-from-left-2 fade-in duration-300">
                        <Input
                            ref={searchInputRef}
                            id="search-input"
                            placeholder={t('searchPlaceholder', language)}
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            onKeyDown={handleSearchKeyDown}
                            disabled={disabled}
                            className="h-8 text-xs bg-muted/30 focus-visible:ring-primary border-none"
                        />
                        <Button
                            size="sm"
                            className="h-8 px-3 text-[10px] font-bold"
                            onClick={handleSearchSubmit}
                            disabled={!searchQuery.trim() || disabled}
                        >
                            {t('search', language)}
                        </Button>
                    </div>
                )}
            </div>

            <div className="relative flex items-end gap-2 group">
                <textarea
                    id="chat-input"
                    ref={textareaRef}
                    placeholder={isImageMode ? t('imageGenPromptPlaceholder', language) : t('askAnything', language)}
                    rows={1}
                    value={text}
                    onChange={handleInput}
                    onKeyDown={handleKeyDown}
                    disabled={disabled}
                    className={cn(
                        "flex-1 min-h-[44px] max-h-[150px] bg-muted/20 border border-border rounded-2xl px-4 py-2.5 text-sm resize-none outline-none transition-all duration-300",
                        "focus:ring-2 focus:ring-primary/20 focus:border-primary focus:bg-card",
                        "placeholder:text-muted-foreground/50",
                        disabled && "opacity-50 cursor-not-allowed"
                    )}
                />
                <Button 
                    id="send-btn"
                    size="icon"
                    className={cn(
                        "h-10 w-10 rounded-xl shrink-0 transition-all duration-300",
                        text.trim() ? "bg-primary scale-100 shadow-lg shadow-primary/20" : "bg-muted text-muted-foreground scale-95"
                    )}
                    title={t('send', language)}
                    aria-label={t('send', language)} 
                    disabled={!text.trim() || disabled} 
                    onClick={handleSend}
                >
                    {isImageMode
                        ? <ImageIcon className="h-4 w-4" />
                        : <Send className={cn("h-4 w-4 transition-transform", text.trim() && "translate-x-0.5 -translate-y-0.5")} />
                    }
                </Button>
            </div>
        </div>
    );
};
