import React, { useState, useEffect } from 'react';
import { ProviderType } from '../../types';
import * as Storage from '../../storage';
import { getProvider } from '../../providers';

interface SettingsViewProps {
    currentProvider: ProviderType;
    onClose: () => void;
    onProviderChange: (p: ProviderType) => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({ currentProvider, onClose, onProviderChange }) => {
    const [apiKey, setApiKey] = useState('');
    const [theme, setTheme] = useState('default');
    const [globalTheme, setGlobalTheme] = useState(false);
    
    // Local settings
    const [baseUrl, setBaseUrl] = useState('');
    const [modelName, setModelName] = useState('');
    const [availableModels, setAvailableModels] = useState<string[]>([]);
    const [isLoadingModels, setIsLoadingModels] = useState(false);

    useEffect(() => {
        loadSettings();
    }, [currentProvider]);

    const loadSettings = async () => {
        const key = await Storage.getApiKey(currentProvider);
        setApiKey(key || '');

        const t = await Storage.getThemePreference();
        setTheme(t);

        const g = await chrome.storage.local.get('ai_sidebar_global');
        setGlobalTheme(!!g.ai_sidebar_global);

        if (currentProvider === 'lmstudio' || currentProvider === 'ollama') {
            const local = await Storage.getLocalSettings(currentProvider);
            const defaultUrl = currentProvider === 'lmstudio' ? 'http://localhost:1234/v1' : 'http://localhost:11434';
            const url = local.url || defaultUrl;
            setBaseUrl(url);
            setModelName(local.model);
            // Always try to fetch models with the URL (even if it's the default)
            fetchModels(url);
        }
    };

    const fetchModels = async (url: string) => {
        if (!url) return;
        setIsLoadingModels(true);
        try {
            const p = getProvider(currentProvider);
            if (p.getModels) {
                const models = await p.getModels('', { baseUrl: url });
                setAvailableModels(models);
            }
        } catch (e) {
            console.warn('Failed to fetch models', e);
            setAvailableModels([]);
        } finally {
            setIsLoadingModels(false);
        }
    };

    const handleSave = async () => {
        const isLocal = currentProvider === 'lmstudio' || currentProvider === 'ollama';
        if (!apiKey && !isLocal) {
            alert('Prosím, zadajte API kľúč');
            return;
        }

        await chrome.storage.local.set({ [Storage.STORAGE_KEYS.API_KEYS[currentProvider]]: apiKey });
        
        if (isLocal) {
            await Storage.saveLocalSettings(currentProvider, baseUrl, modelName);
        }

        alert('Nastavenia uložené!');
        onClose();
    };

    const handleThemeChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
        const newTheme = e.target.value;
        setTheme(newTheme);
        await Storage.saveThemePreference(newTheme);
        document.body.dataset.theme = newTheme;
    };

    const handleGlobalThemeChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const checked = e.target.checked;
        setGlobalTheme(checked);
        await chrome.storage.local.set({ ai_sidebar_global: checked });
    };


    const renderInstructions = (fullProvider: ProviderType) => {
        // Simple mapping or conditional return
        // We use data-provider attribute for tests
        return (
            <>
                {fullProvider === 'gemini' && (
                    <div className="instructions-box provider-instructions" data-provider="gemini">
                        <h3>Ako získať Gemini API kľúč:</h3>
                        <ol>
                            <li>Navštívte <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer">Google AI Studio</a></li>
                            <li>Prihláste sa pomocou svojho Google účtu</li>
                            <li>Kliknite na &quot;Get API Key&quot; alebo &quot;Create API Key&quot;</li>
                            <li>Skopírujte vygenerovaný kľúč (začína na AIzaSy...)</li>
                            <li>Vložte ho nižšie a kliknite na &quot;Uložiť kľúč&quot;</li>
                        </ol>
                        <p className="note">⚠️ Váš API kľúč je uložený lokálne a bezpečne vo vašom prehliadači.</p>
                    </div>
                )}
                {fullProvider === 'openai' && (
                    <div className="instructions-box provider-instructions" data-provider="openai">
                        <h3>Ako získať OpenAI API kľúč:</h3>
                        <ol>
                            <li>Navštívte <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer">OpenAI Platform</a></li>
                            <li>Prihláste sa alebo si vytvorte účet</li>
                            <li>Kliknite na &quot;Create new secret key&quot;</li>
                            <li>Skopírujte vygenerovaný kľúč (začína na sk-...)</li>
                            <li>Vložte ho nižšie a kliknite na &quot;Uložiť kľúč&quot;</li>
                        </ol>
                        <p className="note">⚠️ Používanie OpenAI API je spoplatnené na základe tokenov.</p>
                    </div>
                )}
                {fullProvider === 'claude' && (
                    <div className="instructions-box provider-instructions" data-provider="claude">
                        <h3>Ako získať Claude API kľúč:</h3>
                        <ol>
                            <li>Navštívte <a href="https://console.anthropic.com/" target="_blank" rel="noopener noreferrer">Anthropic Console</a></li>
                            <li>Prihláste sa alebo si vytvorte účet</li>
                            <li>Prejdite do sekcie API Keys</li>
                            <li>Kliknite na &quot;Create Key&quot;</li>
                            <li>Skopírujte vygenerovaný kľúč (začína na sk-ant-...)</li>
                            <li>Vložte ho nižšie a kliknite na &quot;Uložiť kľúč&quot;</li>
                        </ol>
                        <p className="note">⚠️ Claude API vyžaduje platený účet.</p>
                    </div>
                )}
                {fullProvider === 'mistral' && (
                    <div className="instructions-box provider-instructions" data-provider="mistral">
                        <h3>Ako získať Mistral API kľúč:</h3>
                        <ol>
                            <li>Navštívte <a href="https://console.mistral.ai/" target="_blank" rel="noopener noreferrer">Mistral Console</a></li>
                            <li>Prihláste sa alebo si vytvorte účet</li>
                            <li>Prejdite do sekcie API Keys</li>
                            <li>Kliknite na &quot;Create new key&quot;</li>
                            <li>Skopírujte vygenerovaný kľúč</li>
                            <li>Vložte ho nižšie a kliknite na &quot;Uložiť kľúč&quot;</li>
                        </ol>
                        <p className="note">⚠️ Používanie Mistral API je spoplatnené na základe tokenov.</p>
                    </div>
                )}
                {fullProvider === 'lmstudio' && (
                    <div className="instructions-box provider-instructions" data-provider="lmstudio">
                        <h3>Ako nastaviť LM Studio:</h3>
                        <ol>
                            <li>Stiahnite a nainštalujte z <a href="https://lmstudio.ai" target="_blank" rel="noopener noreferrer">lmstudio.ai</a></li>
                            <li>Otvorte LM Studio a stiahnite si model (napr. Meta Llama 3)</li>
                            <li>Prejdite na kartu <b>Local Server</b> (ikona s dvoma šípkami)</li>
                            <li>Kliknite na <b>Start Server</b></li>
                            <li>Nižšie zadajte základnú URL (predvolená: http://localhost:1234/v1)</li>
                        </ol>
                        <p className="note">⚠️ Spúšťanie modelov lokálne vyžaduje značnú RAM a slušné GPU/CPU.</p>
                    </div>
                )}
                {fullProvider === 'ollama' && (
                    <div className="instructions-box provider-instructions" data-provider="ollama">
                        <h3>Ako nastaviť Ollama:</h3>
                        <ol>
                            <li>Stiahnite a nainštalujte z <a href="https://ollama.com" target="_blank" rel="noopener noreferrer">ollama.com</a></li>
                            <li>Otvorte terminál a spustite: <code>ollama run llama3</code></li>
                            <li>Počkajte, kým sa sťahovanie dokončí a objaví sa výzva</li>
                            <li>Nechajte Ollama bežať a zadajte základnú URL nižšie</li>
                        </ol>
                        <p className="note">⚠️ Na macOS/Linuxe Ollama zvyčajne beží automaticky na pozadí.</p>
                    </div>
                )}
            </>
        );
    };

    const isLocal = currentProvider === 'lmstudio' || currentProvider === 'ollama';

    return (
        <div className="settings-content">
                <h2>Vyžaduje sa nastavenie</h2>
                <div className="input-group">
                    <label>Poskytovateľ AI</label>
                    <select 
                        id="provider-select"
                        value={currentProvider} 
                        onChange={(e) => onProviderChange(e.target.value as ProviderType)}
                    >
                        <option value="gemini">Google Gemini</option>
                        <option value="openai">OpenAI ChatGPT</option>
                        <option value="claude">Anthropic Claude</option>
                        <option value="mistral">Mistral AI</option>
                        <option value="ollama">Ollama (Lokálne)</option>
                        <option value="lmstudio">LM Studio (Lokálne)</option>
                    </select>
                </div>

                <div className="input-group">
                    <label>Téma rozhrania</label>
                    <select value={theme} onChange={handleThemeChange}>
                        <option value="default">EduPage</option>
                        <option value="sms">iMessage</option>
                        <option value="gradient">Messenger</option>
                        <option value="discord">Discord</option>
                        <option value="tokyo">Tokyo Night</option>
                        <option value="mono">Monochromatická</option>
                    </select>
                </div>

                <div className="input-group checkbox-group">
                    <input 
                        type="checkbox" 
                        id="global-theme-toggle" 
                        checked={globalTheme} 
                        onChange={handleGlobalThemeChange}
                    />
                    <label htmlFor="global-theme-toggle" className="inline-label">Aplikovať tému aj na EduPage</label>
                </div>

                {renderInstructions(currentProvider)}

                {isLocal && (
                    <div id="local-settings">
                         <div className="input-group">
                            <label>Základná URL</label>
                            <input 
                                id="base-url"
                                type="text" 
                                value={baseUrl} 
                                onChange={(e) => setBaseUrl(e.target.value)} 
                                placeholder="http://localhost:1234"
                            />
                        </div>
                        <div className="input-group">
                            <label>Model</label>
                            {availableModels.length > 0 ? (
                                <select id="model-select" value={modelName} onChange={(e) => setModelName(e.target.value)}>
                                    <option value="" disabled>Vyberte model</option>
                                    {availableModels.map(m => <option key={m} value={m}>{m}</option>)}
                                </select>
                            ) : (
                                <input 
                                    id="model-name"
                                    type="text" 
                                    value={modelName} 
                                    onChange={(e) => setModelName(e.target.value)} 
                                    placeholder="napr. llama3"
                                />
                            )}
                            <button 
                                className="secondary-btn" 
                                style={{ marginTop: '4px', fontSize: '11px', padding: '4px', width: 'auto' }}
                                onClick={() => fetchModels(baseUrl)}
                                disabled={isLoadingModels}
                            >
                                {isLoadingModels ? 'Načítavam...' : '↻ Obnoviť modely'}
                            </button>
                        </div>
                    </div>
                )}

                <div className="input-group">
                    <label>API kľúč</label>
                    <input 
                        id="api-key-input"
                        type="password" 
                        value={apiKey} 
                        onChange={(e) => setApiKey(e.target.value)} 
                        placeholder="Zadajte svoj API kľúč" 
                    />
                    <p className="hint">Váš kľúč je uložený na vašom zariadení a nikdy sa nezdieľa.</p>
                </div>

                <button id="save-key-btn" className="primary-btn" onClick={handleSave}>Uložiť kľúč</button>
                <button className="secondary-btn" onClick={onClose}>Späť do chatu</button>
            </div>
    );
};
