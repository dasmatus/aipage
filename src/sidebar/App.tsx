import React, { useState, useEffect } from 'react';
import { MessageList } from './components/Chat/MessageList';
import { InputArea } from './components/Chat/InputArea';
import { SettingsView } from './components/Settings/SettingsView';
import { useChat } from './hooks/useChat';
import { ProviderType } from './types';
import * as Storage from './storage';

const App: React.FC = () => {
    // State
    const [view, setView] = useState<'chat' | 'settings'>('chat');
    const [provider, setProvider] = useState<ProviderType>('gemini');
    const [apiKey, setApiKey] = useState<string | null>(null);
    const { messages, isTyping, sendMessage, handlePageContext, generatePromptFromAction } = useChat();
    const [isScanning, setIsScanning] = useState(false);

    // Initialization
    useEffect(() => {
        const init = async () => {
             const p = await Storage.getProviderPreference();
             setProvider(p);
             const k = await Storage.getApiKey(p);
             setApiKey(k);
             
             // Check theme
             const theme = await Storage.getThemePreference();
             document.body.dataset.theme = theme;
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
            const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tabs[0]?.id) {
                const response = await chrome.tabs.sendMessage(tabs[0].id, { action: 'get_page_content' });
                if (response && response.content) {
                    handlePageContext(response.content);
                } else {
                    alert('Nepodarilo sa načítať obsah.');
                }
            }
        } catch (e) {
            console.error(e);
            alert('Chyba pri skenovaní.');
        } finally {
            setIsScanning(false);
        }
    };

    const handleActionClick = (action: string) => {
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

    return (
        <div className="app-container">
            {/* Header */}
            <div className="header">
                 <div className="header-title"><span>EduPage AI</span></div>
                 <button className="icon-btn" onClick={() => setView('settings')}>
                     <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="3"></circle>
                        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                     </svg>
                 </button>
            </div>

            {view === 'chat' && (
                <div id="chat-view" className="view" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 50px)' }}>
                    <MessageList messages={messages} onActionClick={handleActionClick} />
                    <InputArea 
                        onSend={handleSend} 
                        onScanPage={handleScanPage} 
                        disabled={isTyping} 
                        isScanning={isScanning}
                    />
                </div>
            )}
            
            {view === 'settings' && (
                <SettingsView 
                    currentProvider={provider} 
                    onProviderChange={handleProviderChange} 
                    onClose={handleSettingsClose} 
                />
            )}
        </div>
    );
};

export default App;
