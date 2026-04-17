import React, { useState, useEffect } from 'react';
import { MessageList } from './components/Chat/MessageList';
import { InputArea } from './components/Chat/InputArea';
import { SettingsView } from './components/Settings/SettingsView';
import { WidgetsView } from './components/Widgets/WidgetsView';
import { useChat } from './hooks/useChat';
import { ProviderType, PageContentResponse } from './types';
import * as Storage from './storage';
import { performRequest } from './providers/utils';
import { generateImage, ImageGenProvider } from './providers/imagegen';
import { getProvider } from './providers';
import { t, getCurrentLanguage, setLanguage as saveLanguage, LANGUAGE_NAMES } from './i18n';
import browser from 'webextension-polyfill';

// Shadcn & Icons
import { Button } from './components/ui/button';
import { Settings, MessageCircle, ChevronLeft, LayoutGrid, Wand2 } from 'lucide-react';
import { cn } from './lib/utils';

type View = 'chat' | 'settings' | 'widgets';

const App: React.FC = () => {
    // State
    const [view, setView] = useState<View>('chat');
    const [provider, setProvider] = useState<ProviderType>('vercel');
    const [, setApiKey] = useState<string | null>(null);
    const { messages, isTyping, sendMessage, handlePageContext, generatePromptFromAction, lastPageContext, addMessage, updateLastMessage, updateLastMessageImage, setIsTyping } = useChat();
    const [isScanning, setIsScanning] = useState(false);
    const [userInitials, setUserInitials] = useState<string>('U');
    const [language, setLanguage] = useState('sk');
    const [exaEnabled, setExaEnabled] = useState(false);
    const [searxngEnabled, setSearxngEnabled] = useState(false);
    const [searxngUrl, setSearxngUrl] = useState('');
    const [imageGenEnabled, setImageGenEnabled] = useState(false);
    const [imageGenProvider, setImageGenProvider] = useState<ImageGenProvider>('vercel');
    const [imageGenSdUrl, setImageGenSdUrl] = useState('http://localhost:7860');
    const [imageGenModel, setImageGenModel] = useState('openai:dall-e-3');
    const [imageGenSize, setImageGenSize] = useState('1024x1024');
    const [autoAnswerEnabled, setAutoAnswerEnabled] = useState(false);
    const [isAutoAnswering, setIsAutoAnswering] = useState(false);

    // Initialization
    const [isInitialized, setIsInitialized] = useState(false);

    useEffect(() => {
        const init = async () => {
            try {
                const p = await Storage.getProviderPreference();
                setProvider(p);

                const [k, lang, exaEn, sEn, sUrl, imgEn, imgProv, imgSdUrl, imgModel, imgSize, autoAns, theme] =
                    await Promise.all([
                        Storage.getApiKey(p),
                        getCurrentLanguage(),
                        Storage.getExaEnabled(),
                        Storage.getSearXNGEnabled(),
                        Storage.getSearXNGUrl(),
                        Storage.getImageGenEnabled(),
                        Storage.getImageGenProvider(),
                        Storage.getImageGenSdUrl(),
                        Storage.getImageGenModel(),
                        Storage.getImageGenSize(),
                        Storage.getAutoAnswerEnabled(),
                        Storage.getThemePreference(),
                    ]);

                setApiKey(k);
                setLanguage(lang);
                setExaEnabled(exaEn);
                setSearxngEnabled(sEn);
                setSearxngUrl(sUrl);
                setImageGenEnabled(imgEn);
                setImageGenProvider(imgProv);
                setImageGenSdUrl(imgSdUrl);
                setImageGenModel(imgModel);
                setImageGenSize(imgSize);
                setAutoAnswerEnabled(autoAns);
                document.body.dataset.theme = theme;

                // Show settings if no API key for non-local providers
                const isLocal = p === 'lmstudio' || p === 'ollama';
                if (!k && !isLocal) {
                    setView('settings');
                }

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
        addMessage('user', `Search web: ${query}`);
        setIsTyping(true);
        addMessage('ai', 'Searching the web...');

        try {
            let searchResults = [];
            let source = 'DuckDuckGo';

            // SearXNG takes priority if enabled
            if (searxngEnabled && searxngUrl) {
                source = 'SearXNG';
                try {
                    const searchUrlEncoded = encodeURIComponent(query.trim());
                    const data = await performRequest(
                        `${searxngUrl.replace(/\/$/, '')}/search?q=${searchUrlEncoded}&format=json`,
                        'GET',
                        { 'Accept': 'application/json' }
                    );
                    if (data?.results?.length) {
                        searchResults = data.results.slice(0, 5).map((r: any) => ({
                            title: r.title || 'Untitled',
                            snippet: r.content || '',
                            url: r.url
                        }));
                    }
                } catch (e) {
                    console.warn('SearXNG search failed, falling back', e);
                    source = 'DuckDuckGo';
                }
            }

            // Check for Exa key if using Vercel (and SearXNG not used)
            if (searchResults.length === 0 && provider === 'vercel') {
                const exaEnabled = await Storage.getExaEnabled();
                const exaKey = await Storage.getExaApiKey();

                if (exaEnabled && exaKey) {
                    source = 'Exa.ai';
                    try {
                        const data = await performRequest('https://api.exa.ai/search', 'POST', {
                            'x-api-key': exaKey,
                            'Content-Type': 'application/json'
                        }, JSON.stringify({
                            query: query.trim(),
                            numResults: 5,
                            useAutoprompt: true
                        }));

                        if (data && data.results) {
                            searchResults = data.results.map((r: any) => ({
                                title: r.title || 'Untitled',
                                snippet: r.text || r.snippet || '',
                                url: r.url
                            }));
                        }
                    } catch (e) {
                        console.warn('Exa search failed, falling back to DuckDuckGo', e);
                    }
                }
            }

            // Fallback to DuckDuckGo
            if (searchResults.length === 0) {
                const response: any = await browser.runtime.sendMessage({
                    action: 'search_web',
                    payload: { query: query.trim() }
                });
                if (response.ok && response.results) {
                    searchResults = response.results;
                }
            }

            if (searchResults.length > 0) {
                const formattedResults = searchResults.map((r: any, i: number) =>
                    `${i + 1}. **${r.title}**\n   ${r.snippet}\n   Source: ${r.url}`
                ).join('\n\n');

                updateLastMessage(`Found ${searchResults.length} results via ${source}. Analyzing...`);

                const languageName = LANGUAGE_NAMES[language] || 'Slovak';
                const searchPrompt = `Based on these web search results for "${query}" (Source: ${source}):\n\n${formattedResults}\n\nPlease provide a comprehensive answer in ${languageName} based on these search results.`;

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

            handleSearchWeb(query);
            return;
        }

        const prompt = generatePromptFromAction(action);
        handleSend(prompt);
    };

    const handleGenerateImage = async (prompt: string) => {
        addMessage('user', `🎨 ${prompt}`);
        setIsTyping(true);
        addMessage('ai', t('imageGenGenerating', language));

        try {
            const currentKey = await Storage.getApiKey(provider);
            const options = await Storage.getLocalSettings(provider);
            const result = await generateImage(prompt, {
                provider: imageGenProvider,
                apiKey: currentKey || '',
                baseUrl: imageGenProvider === 'sdwebui' ? imageGenSdUrl : (options.url || undefined),
                model: imageGenModel,
                size: imageGenSize
            });
            updateLastMessageImage(result.dataUrl, result.revisedPrompt || prompt);
        } catch (error) {
            updateLastMessage(`${t('imageGenFailed', language)}: ${(error as Error).message}`);
        } finally {
            setIsTyping(false);
        }
    };

    const handleAutoAnswer = async () => {
        setIsAutoAnswering(true);
        try {
            const tabs = await browser.tabs.query({ active: true, lastFocusedWindow: true });
            if (!tabs[0]?.id) return;

            const qResponse: any = await browser.tabs.sendMessage(tabs[0].id, { action: 'get_exam_question' });
            if (!qResponse?.ok) {
                addMessage('ai', '⚠️ No exam question found on this page.');
                return;
            }

            let prompt = 'Answer this exam question concisely.\n\n';
            if (qResponse.inputType === 'choice' && qResponse.choices?.length > 0) {
                prompt += `Question:\n${qResponse.questionText}\n\nOptions:\n`;
                prompt += qResponse.choices.map((c: any, i: number) => `${i + 1}. ${c.label} (value: ${c.value})`).join('\n');
                prompt += '\n\nRespond with ONLY the exact value of the correct option, nothing else.';
            } else {
                prompt += `Question:\n${qResponse.questionText}\n\nRespond with a short, direct answer only.`;
            }

            addMessage('ai', '🤖 Auto-answering...');
            setIsTyping(true);

            const currentKey = await Storage.getApiKey(provider);
            const options = await Storage.getLocalSettings(provider);
            const aiProvider = getProvider(provider);
            let answer = '';

            await aiProvider.sendMessage(
                prompt,
                currentKey || '',
                { baseUrl: options.url, modelName: options.model },
                (chunk) => { answer = chunk; updateLastMessage(`🤖 Filling: ${chunk}`); }
            );

            answer = answer.trim();

            const fillResp: any = await browser.tabs.sendMessage(tabs[0].id, {
                action: 'fill_answer',
                payload: { inputType: qResponse.inputType, value: answer }
            });

            if (fillResp?.ok) {
                updateLastMessage(`✅ Filled answer: **${answer}**`);
            } else {
                updateLastMessage(`⚠️ AI answer: **${answer}**\n\n_Could not auto-fill: ${fillResp?.error || 'unknown'}_`);
            }
        } catch (e) {
            updateLastMessage(`❌ Auto-answer error: ${(e as Error).message}`);
        } finally {
            setIsTyping(false);
            setIsAutoAnswering(false);
        }
    };

    const handleProviderChange = async (p: ProviderType) => {
        setProvider(p);
        await Storage.saveProviderPreference(p);
    };

    const handleSettingsClose = async () => {
        const [k, exaEn, sEn, sUrl, imgEn, imgProv, imgSdUrl, imgModel, imgSize, autoAns] =
            await Promise.all([
                Storage.getApiKey(provider),
                Storage.getExaEnabled(),
                Storage.getSearXNGEnabled(),
                Storage.getSearXNGUrl(),
                Storage.getImageGenEnabled(),
                Storage.getImageGenProvider(),
                Storage.getImageGenSdUrl(),
                Storage.getImageGenModel(),
                Storage.getImageGenSize(),
                Storage.getAutoAnswerEnabled(),
            ]);
        setApiKey(k);
        setExaEnabled(exaEn);
        setSearxngEnabled(sEn);
        setSearxngUrl(sUrl);
        setImageGenEnabled(imgEn);
        setImageGenProvider(imgProv);
        setImageGenSdUrl(imgSdUrl);
        setImageGenModel(imgModel);
        setImageGenSize(imgSize);
        setAutoAnswerEnabled(autoAns);
        setView('chat');
    };

    const handleLanguageChange = async (newLang: string) => {
        setLanguage(newLang);
        await saveLanguage(newLang);
    };

    if (!isInitialized) return null;

    const isSecondaryView = view === 'settings' || view === 'widgets';

    return (
        <div className="flex flex-col h-screen bg-background text-foreground overflow-hidden font-sans selection:bg-primary/30">
            {/* Header */}
            <header className="flex items-center justify-between px-4 h-12 border-b bg-card/50 backdrop-blur-md z-50 shrink-0">
                 <div className="flex items-center gap-2">
                    {isSecondaryView ? (
                        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={() => setView('chat')}>
                            <ChevronLeft className="h-4 w-4" />
                        </Button>
                    ) : (
                        <div className="bg-primary/10 p-1.5 rounded-lg border border-primary/20">
                            <MessageCircle className="h-4 w-4 text-primary" />
                        </div>
                    )}
                    <span className="font-bold text-sm tracking-tight">
                        {view === 'settings' ? t('settings', language) : view === 'widgets' ? t('widgets', language) : t('chat', language)}
                    </span>
                 </div>

                 {view === 'chat' && (
                     <div className="flex items-center gap-1">
                         {autoAnswerEnabled && (
                             <Button
                                 variant="ghost"
                                 size="icon"
                                 className={cn("h-8 w-8 rounded-full text-muted-foreground hover:text-primary", isAutoAnswering && "animate-pulse text-primary")}
                                 title="Auto-answer current question"
                                 onClick={handleAutoAnswer}
                                 disabled={isTyping || isAutoAnswering}
                             >
                                 <Wand2 className="h-4 w-4" />
                             </Button>
                         )}
                         <Button
                             variant="ghost"
                             size="icon"
                             className="h-8 w-8 rounded-full text-muted-foreground hover:text-foreground"
                             onClick={() => setView('widgets')}
                             title="Widgets"
                         >
                             <LayoutGrid className="h-4 w-4" />
                         </Button>
                         <Button id="settings-btn" variant="ghost" size="icon" className="h-8 w-8 rounded-full text-muted-foreground hover:text-foreground" onClick={() => setView('settings')}>
                             <Settings className="h-4 w-4" />
                         </Button>
                     </div>
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
                        onGenerateImage={handleGenerateImage}
                        disabled={isTyping}
                        isScanning={isScanning}
                        language={language}
                        exaEnabled={exaEnabled}
                        imageGenEnabled={imageGenEnabled}
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

                <div className={cn(
                    "flex-1 transition-all duration-500 absolute inset-0 bg-background",
                    view === 'widgets' ? "translate-x-0 opacity-100" : "translate-x-full opacity-0 pointer-events-none hidden"
                )}>
                    <WidgetsView />
                </div>
            </main>
        </div>
    );
};

export default App;
