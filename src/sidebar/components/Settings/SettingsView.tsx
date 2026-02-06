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
            setBaseUrl(local.url || (currentProvider === 'lmstudio' ? 'http://localhost:1234/v1' : 'http://localhost:11434'));
            setModelName(local.model);
            if (local.url) fetchModels(local.url);
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

    const isLocal = currentProvider === 'lmstudio' || currentProvider === 'ollama';

    return (
        <div className="view">
            <div className="settings-content">
                <h2>Vyžaduje sa nastavenie</h2>
                <div className="input-group">
                    <label>Poskytovateľ AI</label>
                    <select 
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

                {isLocal && (
                    <div id="local-settings">
                         <div className="input-group">
                            <label>Základná URL</label>
                            <input 
                                type="text" 
                                value={baseUrl} 
                                onChange={(e) => setBaseUrl(e.target.value)} 
                                placeholder="http://localhost:1234"
                            />
                        </div>
                        <div className="input-group">
                            <label>Model</label>
                            {availableModels.length > 0 ? (
                                <select value={modelName} onChange={(e) => setModelName(e.target.value)}>
                                    <option value="" disabled>Vyberte model</option>
                                    {availableModels.map(m => <option key={m} value={m}>{m}</option>)}
                                </select>
                            ) : (
                                <input 
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
                        type="password" 
                        value={apiKey} 
                        onChange={(e) => setApiKey(e.target.value)} 
                        placeholder="Zadajte svoj API kľúč" 
                    />
                    <p className="hint">Váš kľúč je uložený lokálne a nikdy sa nezdieľa.</p>
                </div>

                <button className="primary-btn" onClick={handleSave}>Uložiť kľúč</button>
                <button className="secondary-btn" onClick={onClose}>Späť do chatu</button>
            </div>
        </div>
    );
};
