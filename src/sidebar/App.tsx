import React, { useState, useEffect } from 'react';
import { MessageList } from './components/Chat/MessageList';
import { InputArea } from './components/Chat/InputArea';
import { SettingsView } from './components/Settings/SettingsView';
import { useChat } from './hooks/useChat';
import { ProviderType, PageContentResponse } from './types';
import * as Storage from './storage';
import { t, getCurrentLanguage, setLanguage as saveLanguage } from './i18n';
import browser from 'webextension-polyfill';

// Shadcn & Icons
import { Button } from './components/ui/button';
import { Settings, MessageCircle, ChevronLeft } from 'lucide-react';
import { cn } from './lib/utils';

const App: React.FC = () => {
    // State
    const [view, setView] = useState<'chat' | 'settings'>('chat');
    const [provider, setProvider] = useState<ProviderType>('gemini');
    const [, setApiKey] = useState<string | null>(null);
    const { messages, isTyping, sendMessage, handlePageContext, generatePromptFromAction, lastPageContext, addMessage, updateLastMessage, setIsTyping } = useChat();
    const [isScanning, setIsScanning] = useState(false);
    const [userInitials, setUserInitials] = useState<string>('U');
    const [language, setLanguage] = useState('sk');

    // Initialization
    const [isInitialized, setIsInitialized] = useState(false);

    useEffect(() => {
        const init = async () => {
            try {
                const p = await Storage.getProviderPreference();
                setProvider(p);
                const k = await Storage.getApiKey(p);
                setApiKey(k);
                
                // Load language
                const lang = await getCurrentLanguage();
                setLanguage(lang);
                
                // Show settings if no API key for non-local providers
                const isLocal = p === 'lmstudio' || p === 'ollama';
                if (!k && !isLocal) {
                    setView('settings');
                }
                
                // Check theme
                const theme = await Storage.getThemePreference();
                document.body.dataset.theme = theme;

                // Parse user initials from URL hash if present
                if (window.location.hash.includes('initials=')) {
                    const parts = window.location.hash.split('initials=');
                    if (parts.length > 1) {
                        setUserInitials(decodeURIComponent(parts[1]));
                    }
                }
            } catch (e) {
                console.error("Initialization error:", e);
            } finally {
                setIsInitialized(true);
            }
        };
        init();
    }, []);

    const handleSend = async (text: string) => {
        const currentKey = await Storage.getApiKey(provider);
        const options = (provider === 'lmstudio' || provider === 'ollama' || provider === 'vercel') 
            ? await Storage.getLocalSettings(provider) 
            : undefined;

        await sendMessage(text, provider, currentKey, options ? { baseUrl: options.url, modelName: options.model } : undefined);
    };

    const handleScanPage = async () => {
        try {
            setIsScanning(true);
            const tabs = await browser.tabs.query({ active: true, lastFocusedWindow: true });
            if (tabs[0]?.id) {
                const response = (await browser.tabs.sendMessage(tabs[0].id, { action: 'get_page_content' })) as PageContentResponse;
                if (response && response.content) {
                    handlePageContext(response.content, response.isSelection);
                } else {
                    alert(t('alertContentLoadFailed', language));
                }
            }
        } catch (e) {
            console.error(e);
            alert(t('alertScanError', language));
        } finally {
            setIsScanning(false);
        }
    };

    const handleSearchWeb = async (query: string) => {
        const isRemoteWithModels = provider === 'lmstudio' || provider === 'ollama' || provider === 'vercel';
        if (!isRemoteWithModels) {
            alert('Web search requires a local model (LM Studio or Ollama).');
            return;
        }

        addMessage('user', `Search web: ${query}`);
        setIsTyping(true);
        addMessage('ai', 'Searching the web...');

        try {
            const response: any = await browser.runtime.sendMessage({
                action: 'search_web',
                payload: { query: query.trim() }
            });

            if (response.ok && response.results && response.results.length > 0) {
                const formattedResults = response.results.map((r: any, i: number) => 
                    `${i + 1}. **${r.title}**\n   ${r.snippet}\n   Source: ${r.url}`
                ).join('\n\n');

                updateLastMessage(`Found ${response.results.length} results. Analyzing...`);

                const searchPrompt = `Based on these web search results for "${query}":\n\n${formattedResults}\n\nPlease provide a comprehensive answer in Slovak based on these search results.`;

                const currentKey = await Storage.getApiKey(provider);
                const options = await Storage.getLocalSettings(provider);
                
                await sendMessage(searchPrompt, provider, currentKey, { baseUrl: options.url, modelName: options.model });
            } else {
                updateLastMessage('No search results found.');
                setIsTyping(false);
            }
        } catch (error) {
            console.error('Search error:', error);
            updateLastMessage(`Search error: ${(error as Error).message}`);
            setIsTyping(false);
        }
    };

    const handleActionClick = async (action: string) => {
        if (action === 'search_web') {
            const query = messages[messages.length - 1]?.actions?.find(a => a.action === 'search_web') 
                ? messages[messages.length - 1].content.match(/"([^"]+)"/)?.[1] || lastPageContext 
                : lastPageContext;

            if (!query) return;

            const isRemoteWithModels = provider === 'lmstudio' || provider === 'ollama' || provider === 'vercel';
            if (isRemoteWithModels) {
                handleSearchWeb(query);
            } else {
                window.open(`https://duckduckgo.com/?q=${encodeURIComponent(query)}`, '_blank');
            }
            return;
        }

        const prompt = generatePromptFromAction(action);
        handleSend(prompt);
    };

    const handleProviderChange = async (p: ProviderType) => {
        setProvider(p);
        await Storage.saveProviderPreference(p);
    };

    const handleSettingsClose = async () => {
        const k = await Storage.getApiKey(provider);
        setApiKey(k);
        setView('chat');
    };

    const handleLanguageChange = async (newLang: string) => {
        setLanguage(newLang);
        await saveLanguage(newLang);
    };

    if (!isInitialized) return null;

    return (
        <div className="flex flex-col h-screen bg-background text-foreground overflow-hidden font-sans selection:bg-primary/30">
            {/* Header */}
            <header className="flex items-center justify-between px-4 h-12 border-b bg-card/50 backdrop-blur-md z-50 shrink-0">
                 <div className="flex items-center gap-2">
                    {view === 'settings' ? (
                        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={() => setView('chat')}>
                            <ChevronLeft className="h-4 w-4" />
                        </Button>
                    ) : (
                        <div className="bg-primary/10 p-1.5 rounded-lg border border-primary/20">
                            <MessageCircle className="h-4 w-4 text-primary" />
                        </div>
                    )}
                    <span className="font-bold text-sm tracking-tight">
                        {view === 'settings' ? t('settings', language) : t('chat', language)}
                    </span>
                 </div>
                 
                 {view === 'chat' && (
                     <Button id="settings-btn" variant="ghost" size="icon" className="h-8 w-8 rounded-full text-muted-foreground hover:text-foreground" onClick={() => setView('settings')}>
                         <Settings className="h-4 w-4" />
                     </Button>
                 )}
            </header>

            <main className="flex-1 relative overflow-hidden flex flex-col">
                <div className={cn(
                    "flex-1 flex flex-col transition-all duration-500 absolute inset-0",
                    view === 'chat' ? "translate-x-0 opacity-100" : "-translate-x-full opacity-0 pointer-events-none hidden"
                )}>
                    <MessageList 
                        messages={messages} 
                        onActionClick={handleActionClick} 
                        disableActions={isTyping}
                        userInitials={userInitials}
                        language={language}
                    />
                    <InputArea 
                        onSend={handleSend} 
                        onScanPage={handleScanPage} 
                        onSearchWeb={handleSearchWeb}
                        disabled={isTyping} 
                        isScanning={isScanning}
                        language={language}
                    />
                </div>
                
                <div className={cn(
                    "flex-1 transition-all duration-500 absolute inset-0 bg-background",
                    view === 'settings' ? "translate-x-0 opacity-100" : "translate-x-full opacity-0 pointer-events-none hidden"
                )}>
                    <SettingsView 
                        currentProvider={provider} 
                        onProviderChange={handleProviderChange} 
                        onClose={handleSettingsClose} 
                        language={language}
                        onLanguageChange={handleLanguageChange}
                    />
                </div>
            </main>
        </div>
    );
};

export default App;
