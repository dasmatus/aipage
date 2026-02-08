import React, { useState, useEffect } from 'react';
import { MessageList } from './components/Chat/MessageList';
import { InputArea } from './components/Chat/InputArea';
import { SettingsView } from './components/Settings/SettingsView';
import { useChat } from './hooks/useChat';
import { ProviderType, PageContentResponse } from './types';
import * as Storage from './storage';
import { t, getCurrentLanguage, setLanguage as saveLanguage } from './i18n';
import browser from 'webextension-polyfill';

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
        // Fetch fresh API key in case it changed
        const currentKey = await Storage.getApiKey(provider);
        const options = (provider === 'lmstudio' || provider === 'ollama') 
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
            } else {
                console.warn("No active tab found");
            }
        } catch (e) {
            console.error(e);
            alert(t('alertScanError', language));
        } finally {
            setIsScanning(false);
        }
    };


    const handleSearchWeb = async (query: string) => {
        // Check if using local model
        const isLocalModel = provider === 'lmstudio' || provider === 'ollama';
        
        if (!isLocalModel) {
            alert('Web search requires a local model (LM Studio or Ollama). Please switch to a local provider in settings.');
            return;
        }

        // Trigger web search
        addMessage('user', `Search web: ${query}`);
        setIsTyping(true);
        addMessage('ai', 'Searching the web...');

        try {
            // Call background script to search
            const response: any = await browser.runtime.sendMessage({
                action: 'search_web',
                payload: { query: query.trim() }
            });

            if (response.ok && response.results && response.results.length > 0) {
                // Format search results
                const formattedResults = response.results.map((r: any, i: number) => 
                    `${i + 1}. **${r.title}**\n   ${r.snippet}\n   Source: ${r.url}`
                ).join('\n\n');

                updateLastMessage(`Found ${response.results.length} results. Analyzing...`);

                // Inject into AI prompt
                const searchPrompt = `Based on these web search results for "${query}":\n\n${formattedResults}\n\nPlease provide a comprehensive answer in Slovak based on these search results.`;

                // Get current settings for local model
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

            // Check if using local model
            const isLocalModel = provider === 'lmstudio' || provider === 'ollama';

            if (isLocalModel) {
                // Perform web search and inject results into AI
                addMessage('user', `Search web: ${query}`);
                setIsTyping(true);
                addMessage('ai', 'Searching the web...');

                try {
                    // Call background script to search
                    const response: any = await browser.runtime.sendMessage({
                        action: 'search_web',
                        payload: { query }
                    });

                    if (response.ok && response.results && response.results.length > 0) {
                        // Format search results
                        const formattedResults = response.results.map((r: any, i: number) => 
                            `${i + 1}. **${r.title}**\n   ${r.snippet}\n   Source: ${r.url}`
                        ).join('\n\n');

                        updateLastMessage(`Found ${response.results.length} results. Analyzing...`);

                        // Inject into AI prompt
                        const searchPrompt = `Based on these web search results for "${query}":\n\n${formattedResults}\n\nPlease provide a comprehensive answer in Slovak based on these search results.`;

                        // Get current settings for local model
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
            } else {
                // Cloud provider: open DDG in new tab (existing behavior)
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
        // Refresh key when closing settings
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
        <div className="app-container">
            {/* Header */}
            <div className="header">
                 <div className="header-title"><span>AIPage</span></div>
                 <button id="settings-btn" className="icon-btn" onClick={() => setView('settings')}>
                     <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="3"></circle>
                        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                     </svg>
                 </button>
            </div>


            <div id="chat-view" className={view === 'chat' ? 'view' : 'view hidden'} style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 50px)' }}>
                <MessageList 
                    messages={messages} 
                    onActionClick={handleActionClick} 
                    disableActions={isTyping}
                    userInitials={userInitials}
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
            
            <div id="settings-view" className={view === 'settings' ? 'view' : 'view hidden'}>
                <SettingsView 
                    currentProvider={provider} 
                    onProviderChange={handleProviderChange} 
                    onClose={handleSettingsClose} 
                    language={language}
                    onLanguageChange={handleLanguageChange}
                />
            </div>
        </div>
    );
};

export default App;
