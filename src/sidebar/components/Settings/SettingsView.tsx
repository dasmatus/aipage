import React, { useState, useEffect } from 'react';
import { ProviderType } from '../../types';
import * as Storage from '../../storage';
import { getProvider } from '../../providers';
// i18n imports removed as we use props now
import { t } from '../../i18n';
import browser from '../../../polyfills/browser-polyfill';

interface SettingsViewProps {
    currentProvider: ProviderType;
    onClose: () => void;
    onProviderChange: (p: ProviderType) => void;
    language: string;
    onLanguageChange: (lang: string) => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({ currentProvider, onClose, onProviderChange, language, onLanguageChange }) => {
    const [apiKey, setApiKey] = useState('');
    const [theme, setTheme] = useState('default');
    const [globalTheme, setGlobalTheme] = useState(false);
    // language state removed
    
    // Local settings
    const [baseUrl, setBaseUrl] = useState('');
    const [modelName, setModelName] = useState('');
    const [availableModels, setAvailableModels] = useState<string[]>([]);
    const [isLoadingModels, setIsLoadingModels] = useState(false);
    const [fetchError, setFetchError] = useState<string | null>(null);

    useEffect(() => {
        loadSettings();
        // loadLanguage removed
    }, [currentProvider]);

    // loadLanguage removed

    const loadSettings = async () => {
        const key = await Storage.getApiKey(currentProvider);
        setApiKey(key || '');

        const t = await Storage.getThemePreference();
        setTheme(t);

        const g = await browser.storage.local.get('ai_sidebar_global');
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
        setFetchError(null);
        try {
            const p = getProvider(currentProvider);
            if (p.getModels) {
                const models = await p.getModels('', { baseUrl: url });
                setAvailableModels(models);
                if (models.length === 0) setFetchError(t('noModelsFound', language) || 'No models found');
            }
        } catch (e) {
            console.warn('Failed to fetch models', e);
            setAvailableModels([]);
            setFetchError((e as Error).message || 'Failed to fetch models');
        } finally {
            setIsLoadingModels(false);
        }
    };

    const handleSave = async () => {
        const isLocal = currentProvider === 'lmstudio' || currentProvider === 'ollama';
        if (!apiKey && !isLocal) {
            alert(t('alertPleaseEnterKey', language));
            return;
        }

        await browser.storage.local.set({ [Storage.STORAGE_KEYS.API_KEYS[currentProvider]]: apiKey });
        
        if (isLocal) {
            await Storage.saveLocalSettings(currentProvider, baseUrl, modelName);
        }

        alert(t('alertSettingsSaved', language));
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
        await browser.storage.local.set({ ai_sidebar_global: checked });
    };

    const handleLanguageChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
        const newLang = e.target.value;
        onLanguageChange(newLang);
    };


    const renderInstructions = (fullProvider: ProviderType) => {
        return (
            <>
                {fullProvider === 'gemini' && (
                    <div className="instructions-box provider-instructions" data-provider="gemini">
                        <h3>{t('geminiInstructionsTitle', language)}</h3>
                        <ol>
                            <li>{t('geminiStep1', language)} <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer">Google AI Studio</a></li>
                            <li>{t('geminiStep2', language)}</li>
                            <li>{t('geminiStep3', language)}</li>
                            <li>{t('geminiStep4', language)}</li>
                            <li>{t('geminiStep5', language)}</li>
                        </ol>
                        <p className="note">{t('geminiNote', language)}</p>
                        <p className="note" style={{marginTop: '0.5rem'}}>
                            <a href="https://discuss.ai.google.dev/t/cant-create-project-or-apikey-from-ai-stuidio/108979/4" target="_blank" rel="noopener noreferrer">
                                {t('geminiTroubleshoot', language)}
                            </a>
                        </p>
                    </div>
                )}
                {fullProvider === 'openai' && (
                    <div className="instructions-box provider-instructions" data-provider="openai">
                        <h3>{t('openaiInstructionsTitle', language)}</h3>
                        <ol>
                            <li>{t('openaiStep1', language)} <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer">OpenAI Platform</a></li>
                            <li>{t('openaiStep2', language)}</li>
                            <li>{t('openaiStep3', language)}</li>
                            <li>{t('openaiStep4', language)}</li>
                            <li>{t('openaiStep5', language)}</li>
                        </ol>
                        <p className="note">{t('openaiNote', language)}</p>
                    </div>
                )}
                {fullProvider === 'claude' && (
                    <div className="instructions-box provider-instructions" data-provider="claude">
                        <h3>{t('claudeInstructionsTitle', language)}</h3>
                        <ol>
                            <li>{t('claudeStep1', language)} <a href="https://console.anthropic.com/" target="_blank" rel="noopener noreferrer">Anthropic Console</a></li>
                            <li>{t('claudeStep2', language)}</li>
                            <li>{t('claudeStep3', language)}</li>
                            <li>{t('claudeStep4', language)}</li>
                            <li>{t('claudeStep5', language)}</li>
                            <li>{t('claudeStep6', language)}</li>
                        </ol>
                        <p className="note">{t('claudeNote', language)}</p>
                    </div>
                )}
                {fullProvider === 'mistral' && (
                    <div className="instructions-box provider-instructions" data-provider="mistral">
                        <h3>{t('mistralInstructionsTitle', language)}</h3>
                        <ol>
                            <li>{t('mistralStep1', language)} <a href="https://console.mistral.ai/" target="_blank" rel="noopener noreferrer">Mistral Console</a></li>
                            <li>{t('mistralStep2', language)}</li>
                            <li>{t('mistralStep3', language)}</li>
                            <li>{t('mistralStep4', language)}</li>
                            <li>{t('mistralStep5', language)}</li>
                            <li>{t('mistralStep6', language)}</li>
                        </ol>
                        <p className="note">{t('mistralNote', language)}</p>
                    </div>
                )}
                {fullProvider === 'lmstudio' && (
                    <div className="instructions-box provider-instructions" data-provider="lmstudio">
                        <h3>{t('lmstudioInstructionsTitle', language)}</h3>
                        <ol>
                            <li>{t('lmstudioStep1', language)} <a href="https://lmstudio.ai" target="_blank" rel="noopener noreferrer">lmstudio.ai</a></li>
                            <li>{t('lmstudioStep2', language)}</li>
                            <li>{t('lmstudioStep3', language)}</li>
                            <li>{t('lmstudioStep4', language)}</li>
                            <li>{t('lmstudioStep5', language)}</li>
                        </ol>
                        <p className="note">{t('lmstudioNote', language)}</p>
                    </div>
                )}
                {fullProvider === 'ollama' && (
                    <div className="instructions-box provider-instructions" data-provider="ollama">
                        <h3>{t('ollamaInstructionsTitle', language)}</h3>
                        <ol>
                            <li>{t('ollamaStep1', language)} <a href="https://ollama.com" target="_blank" rel="noopener noreferrer">ollama.com</a></li>
                            <li>{t('ollamaStep2', language)} <code>ollama run llama3</code></li>
                            <li>{t('ollamaStep3', language)}</li>
                            <li>{t('ollamaStep4', language)}</li>
                        </ol>
                        <p className="note">{t('ollamaNote', language)}</p>
                    </div>
                )}
            </>
        );
    };

    const isLocal = currentProvider === 'lmstudio' || currentProvider === 'ollama';

    return (
        <div className="settings-content">
                <h2>{t('settingsTitle', language)}</h2>
                <div className="input-group">
                    <label>{t('aiProvider', language)}</label>
                    <select 
                        id="provider-select"
                        value={currentProvider} 
                        onChange={(e) => onProviderChange(e.target.value as ProviderType)}
                    >
                        <option value="gemini">{t('providerGemini', language)}</option>
                        <option value="openai">{t('providerChatGPT', language)}</option>
                        <option value="claude">{t('providerClaude', language)}</option>
                        <option value="mistral">{t('providerMistral', language)}</option>
                        <option value="ollama">{t('providerOllama', language)}</option>
                        <option value="lmstudio">{t('providerLMStudio', language)}</option>
                    </select>
                </div>

                <div className="input-group">
                    <label>{t('themeInterface', language)}</label>
                    <select value={theme} onChange={handleThemeChange}>
                        <option value="default">{t('themeEduPage', language)}</option>
                        <option value="sms">{t('themeImessage', language)}</option>
                        <option value="gradient">{t('themeMessenger', language)}</option>
                        <option value="discord">{t('themeDiscord', language)}</option>
                        <option value="tokyo">{t('themeTokyo', language)}</option>
                        <option value="mono">{t('themeMono', language)}</option>
                    </select>
                </div>

                <div className="input-group checkbox-group">
                    <input 
                        type="checkbox" 
                        id="global-theme-toggle" 
                        checked={globalTheme} 
                        onChange={handleGlobalThemeChange}
                    />
                    <label htmlFor="global-theme-toggle" className="inline-label">{t('applyThemeGlobal', language)}</label>
                </div>

                <div className="input-group">
                    <label htmlFor="language-select">{t('language', language).toUpperCase()}</label>
                    <select id="language-select" value={language} onChange={handleLanguageChange}>
                        <option value="sk">Slovenčina</option>
                        <option value="en">English</option>
                        <option value="cs">Čeština</option>
                        <option value="de">Deutsch</option>
                        <option value="hu">Magyar</option>
                    </select>
                </div>

                {renderInstructions(currentProvider)}

                {isLocal && (
                    <div id="local-settings">
                         <div className="input-group">
                            <label>{t('baseUrl', language)}</label>
                            <input 
                                id="base-url"
                                type="text" 
                                value={baseUrl} 
                                onChange={(e) => setBaseUrl(e.target.value)} 
                                placeholder="http://localhost:1234"
                            />
                        </div>
                        <div className="input-group">
                            <label>{t('model', language)}</label>
                            {isLoadingModels ? (
                                <div style={{ fontSize: '12px', color: 'var(--eduba-body-text)', padding: '8px 0' }}>
                                    {t('loading', language)}
                                </div>
                            ) : (
                                <select 
                                    id="model-select" 
                                    value={modelName} 
                                    onChange={(e) => setModelName(e.target.value)}
                                    className={availableModels.length === 0 ? 'error-border' : ''}
                                >
                                    <option value="" disabled>{availableModels.length > 0 ? t('selectModel', language) : t('noModelsFound', language)}</option>
                                    {availableModels.map(m => <option key={m} value={m}>{m}</option>)}
                                </select>
                            )}
                            <button 
                                className="secondary-btn" 
                                style={{ marginTop: '4px', fontSize: '11px', padding: '4px', width: 'auto' }}
                                onClick={() => fetchModels(baseUrl)}
                                disabled={isLoadingModels}
                            >
                                {isLoadingModels ? t('loading', language) : t('refreshModels', language)}
                            </button>
                            {fetchError && <p className="error-text" style={{ fontSize: '11px', color: 'var(--eduba-danger)', marginTop: '4px' }}>{fetchError}</p>}
                        </div>
                    </div>
                )}

                <div className="input-group">
                    <label>{t('apiKey', language)}</label>
                    <input 
                        id="api-key-input"
                        type="password" 
                        value={apiKey} 
                        onChange={(e) => setApiKey(e.target.value)} 
                        placeholder={t('apiKeyPlaceholder', language)} 
                    />
                    <p className="hint">{t('apiKeyHint', language)}</p>
                </div>

                <button id="save-key-btn" className="primary-btn" onClick={handleSave}>{t('saveKey', language)}</button>
                <button className="secondary-btn" onClick={onClose}>{t('backToChat', language)}</button>
            </div>
    );
};
