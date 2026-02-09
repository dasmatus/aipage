import React, { useState, useEffect } from 'react';
import { ProviderType } from '../../types';
import * as Storage from '../../storage';
import { getProvider } from '../../providers';
import { t as translate } from '../../i18n';
import browser from '../../../polyfills/browser-polyfill';

// Shadcn UI Components
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Switch } from '../ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel } from '../ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Separator } from '../ui/separator';
import { RefreshCw, Zap, Settings2, Palette, Languages, ExternalLink, AlertCircle } from 'lucide-react';
import { cn as class_name } from '../../lib/utils';

interface SettingsViewProps {
    currentProvider: ProviderType;
    onClose: () => void;
    onProviderChange: (p: ProviderType) => void;
    language: string;
    onLanguageChange: (lang: string) => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({ currentProvider, onClose, onProviderChange, language, onLanguageChange }) => {
    const [apiKey, setApiKey] = useState('');
    const [exaApiKey, setExaApiKey] = useState('');
    const [exaEnabled, setExaEnabled] = useState(false);
    const [theme, setTheme] = useState('default');
    const [globalTheme, setGlobalTheme] = useState(false);
    const [autoUpdate, setAutoUpdate] = useState(false);
    const [providerBackend, setProviderBackend] = useState<'vercel' | 'ollama' | 'lmstudio'>('vercel');
    
    // Local settings
    const [baseUrl, setBaseUrl] = useState('');
    const [modelName, setModelName] = useState('');
    const [availableModels, setAvailableModels] = useState<any[]>([]);
    const [isLoadingModels, setIsLoadingModels] = useState(false);
    const [fetchError, setFetchError] = useState<string | null>(null);

    useEffect(() => {
        loadSettings();
    }, [currentProvider]);

    // Internal effect to handle backend transitions
    useEffect(() => {
        // Ensure provider matches backend
        if (providerBackend === 'vercel' && currentProvider !== 'vercel') {
            onProviderChange('vercel');
        } else if (providerBackend === 'ollama' && currentProvider !== 'ollama') {
            onProviderChange('ollama');
        } else if (providerBackend === 'lmstudio' && currentProvider !== 'lmstudio') {
            onProviderChange('lmstudio');
        }
    }, [providerBackend, currentProvider, onProviderChange]);

    const loadSettings = async () => {
        const key = await Storage.getApiKey(currentProvider);
        setApiKey(key || '');

        const exaKey = await Storage.getExaApiKey();
        setExaApiKey(exaKey || '');

        const exaEn = await Storage.getExaEnabled();
        setExaEnabled(exaEn);

        const th = await Storage.getThemePreference();
        setTheme(th);

        const g = await browser.storage.local.get('ai_sidebar_global');
        setGlobalTheme(!!g.ai_sidebar_global);

        const u = await browser.storage.local.get('autoUpdate');
        setAutoUpdate(!!u.autoUpdate);

        const backend = await Storage.getProviderBackendPreference();
        setProviderBackend(backend);

        const local = await Storage.getLocalSettings(currentProvider);
        setModelName(local.model || '');

        if (backend === 'lmstudio' || backend === 'ollama') {
            const defaultUrl = backend === 'lmstudio' ? 'http://localhost:1234/v1' : 'http://localhost:11434';
            const url = local.url || defaultUrl;
            setBaseUrl(url);
            fetchModels(url, key || '');
        } else if (backend === 'vercel') {
            fetchModels('https://ai-gateway.vercel.sh/v1/models', key || '');
        }
    };

    const fetchModels = async (url: string, manualKey?: string) => {
        if (!url) return;
        setIsLoadingModels(true);
        setFetchError(null);
        try {
            const p = getProvider(currentProvider);
            if (p.getModels) {
                const effectiveKey = manualKey !== undefined ? manualKey : apiKey;
                const models = await p.getModels(effectiveKey, { baseUrl: url });
                setAvailableModels(models);
                if (models.length === 0) setFetchError(translate('noModelsFound', language) || 'No models found');
            } else {
                setAvailableModels([]);
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
            alert(translate('alertPleaseEnterKey', language));
            return;
        }

        const storageKey = (Storage.STORAGE_KEYS.API_KEYS as any)[currentProvider];
        if (storageKey) {
            await browser.storage.local.set({ [storageKey]: apiKey });
        }
        
        await Storage.saveExaApiKey(exaApiKey);
        await Storage.saveExaEnabled(exaEnabled);
        
        await Storage.saveLocalSettings(currentProvider, baseUrl, modelName);

        alert(translate('alertSettingsSaved', language));
        onClose();
    };

    const handleThemeChange = async (value: string) => {
        setTheme(value);
        await Storage.saveThemePreference(value);
        document.body.dataset.theme = value;
    };

    const handleGlobalThemeChange = async (checked: boolean) => {
        setGlobalTheme(checked);
        await browser.storage.local.set({ ai_sidebar_global: checked });
    };

    const handleAutoUpdateChange = async (checked: boolean) => {
        setAutoUpdate(checked);
        await browser.storage.local.set({ autoUpdate: checked });
    };

    const handleBackendChange = async (value: 'vercel' | 'ollama' | 'lmstudio') => {
        setProviderBackend(value);
        await Storage.saveProviderBackendPreference(value);
        onProviderChange(value); // Directly map backend to provider
    };

    const renderInstructions = (fullProvider: ProviderType) => {
        if (providerBackend === 'vercel') return null;

        const instructions: Record<string, { title: string, steps: (string | React.ReactNode)[], note?: string, troubleshoot?: string }> = {
            lmstudio: {
                title: translate('lmstudioInstructionsTitle', language),
                steps: [
                    <>{translate('lmstudioStep1', language)} <a href="https://lmstudio.ai" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">lmstudio.ai</a></>,
                    translate('lmstudioStep2', language),
                    translate('lmstudioStep3', language),
                    translate('lmstudioStep4', language),
                    translate('lmstudioStep5', language),
                ],
                note: translate('lmstudioNote', language)
            },
            ollama: {
                title: translate('ollamaInstructionsTitle', language),
                steps: [
                    <>{translate('ollamaStep1', language)} <a href="https://ollama.com" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">ollama.com</a></>,
                    <>{translate('ollamaStep2', language)} <code className="bg-muted px-1 rounded">ollama run llama3</code></>,
                    translate('ollamaStep3', language),
                    translate('ollamaStep4', language),
                ],
                note: translate('ollamaNote', language)
            }
        };

        const inst = instructions[fullProvider];
        if (!inst) return null;

        return (
            <Card className="mb-6 bg-secondary/30 border-dashed">
                <CardHeader className="py-3 px-4">
                    <CardTitle className="text-sm flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 text-primary" />
                        {inst.title}
                    </CardTitle>
                </CardHeader>
                <CardContent className="py-0 px-4 pb-4">
                    <ol className="list-decimal list-inside text-xs space-y-1 text-muted-foreground">
                        {inst.steps.map((step, i) => <li key={i}>{step}</li>)}
                    </ol>
                    {inst.note && <p className="text-[10px] mt-2 opacity-70 italic">{inst.note}</p>}
                    {inst.troubleshoot && (
                        <a href="https://discuss.ai.google.dev/t/cant-create-project-or-apikey-from-ai-stuidio/108979/4" 
                           target="_blank" rel="noopener noreferrer" 
                           className="text-[10px] mt-1 block text-primary hover:underline flex items-center gap-1">
                            <ExternalLink className="w-3 h-3" /> {inst.troubleshoot}
                        </a>
                    )}
                </CardContent>
            </Card>
        );
    };

    const isLocal = currentProvider === 'lmstudio' || currentProvider === 'ollama';

    return (
        <div className="flex flex-col h-full bg-background overflow-y-auto px-4 py-6 selection:bg-primary selection:text-primary-foreground">
            <div className="max-w-[500px] mx-auto w-full space-y-6">
                <header className="flex flex-col gap-1">
                    <h2 className="text-2xl font-bold tracking-tight text-foreground">{translate('settingsTitle', language)}</h2>
                    <p className="text-sm text-muted-foreground">{translate('settingsDescription', language)}</p>
                </header>

                <Card className={class_name("overflow-hidden transition-all duration-300", 
                            providerBackend === 'vercel' && "border-primary/50 shadow-lg shadow-primary/10")}>
                    <CardHeader className="space-y-1 bg-muted/30">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Zap className={class_name("w-4 h-4", providerBackend === 'vercel' ? "text-primary" : "text-muted-foreground")} />
                                <CardTitle className="text-lg">{translate('providerEngine', language)}</CardTitle>
                            </div>
                        </div>
                        <CardDescription>
                            {providerBackend === 'vercel' 
                                ? translate('vercelDescription', language)
                                : translate('standardDescription', language)}
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="pt-6 space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="backend-select" className="text-xs uppercase font-bold tracking-wider opacity-70">{translate('engineMode', language)}</Label>
                            <Select value={providerBackend} onValueChange={(v) => handleBackendChange(v as 'vercel' | 'ollama' | 'lmstudio')}>
                                <SelectTrigger className={class_name(providerBackend === 'vercel' && "border-primary ring-primary")}>
                                    <SelectValue placeholder={translate('selectEngine', language)} />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="vercel" className="flex items-center gap-2">
                                        {translate('vercelMode', language)}
                                    </SelectItem>
                                    <SelectItem value="ollama" className="flex items-center gap-2">
                                        {translate('providerOllama', language)}
                                    </SelectItem>
                                    <SelectItem value="lmstudio" className="flex items-center gap-2">
                                        {translate('providerLMStudio', language)}
                                    </SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </CardContent>
                </Card>

                {renderInstructions(currentProvider)}

                <Card>
                    <CardHeader className="py-4 px-6 bg-muted/10">
                        <div className="flex items-center gap-2">
                            <Settings2 className="w-4 h-4 text-primary" />
                            <CardTitle className="text-sm">{translate('modelAndAuth', language)}</CardTitle>
                        </div>
                    </CardHeader>
                    <CardContent className="p-6 space-y-6">
                        {(providerBackend === 'ollama' || providerBackend === 'lmstudio' || providerBackend === 'vercel') && (
                            <div className="space-y-4 animate-in fade-in duration-500">
                                {(providerBackend === 'ollama' || providerBackend === 'lmstudio') && (
                                    <div className="space-y-2">
                                        <Label htmlFor="base-url" className="text-xs uppercase font-bold tracking-wider opacity-70">{translate('baseUrl', language)}</Label>
                                        <Input 
                                            id="base-url"
                                            value={baseUrl} 
                                            onChange={(e) => setBaseUrl(e.target.value)} 
                                            placeholder="http://localhost:1234"
                                            className="bg-muted/30 focus-visible:ring-primary"
                                        />
                                    </div>
                                )}
                                <div className="space-y-2">
                                    <Label className="text-xs uppercase font-bold tracking-wider opacity-70">{translate('model', language)}</Label>
                                    {isLoadingModels ? (
                                        <div className="flex items-center gap-2 text-xs text-muted-foreground animate-pulse py-2">
                                            <RefreshCw className="w-3 h-3 animate-spin" /> {translate('loading', language)}...
                                        </div>
                                    ) : (
                                        <div className="flex gap-2">
                                            <Select value={modelName} onValueChange={setModelName}>
                                                <SelectTrigger className={class_name("flex-1", availableModels.length === 0 && "border-destructive/50")}>
                                                    <SelectValue placeholder={availableModels.length > 0 ? translate('selectModel', language) : translate('noModelsFound', language)} />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {availableModels.length === 0 ? (
                                                        <SelectItem value="none" disabled>{translate('noModelsFound', language)}</SelectItem>
                                                    ) : (() => {
                                                        const groups: Record<string, any[]> = {};
                                                        availableModels.forEach(m => {
                                                            const p = m.provider || 'other';
                                                            if (!groups[p]) groups[p] = [];
                                                            groups[p].push(m);
                                                        });

                                                        return Object.entries(groups).map(([provider, models]) => (
                                                            <SelectGroup key={provider}>
                                                                <SelectLabel className="bg-muted/50 py-1 px-2 text-[10px] font-black uppercase text-muted-foreground tracking-[2px]">
                                                                    {provider}
                                                                </SelectLabel>
                                                                {models.map(m => {
                                                                    const label = m.id.includes(':') 
                                                                        ? m.id.split(':').slice(1).join(':') 
                                                                        : (m.id.includes('/') ? m.id.split('/').slice(1).join('/') : m.id);
                                                                    return (
                                                                        <SelectItem key={m.id} value={m.id}>
                                                                            {label} <span className="text-[10px] opacity-60 ml-1">{m.pricing ? `(${m.pricing})` : `(${translate('free', language)})`}</span>
                                                                        </SelectItem>
                                                                    );
                                                                })}
                                                            </SelectGroup>
                                                        ));
                                                    })()}
                                                </SelectContent>
                                            </Select>
                                            <Button 
                                                variant="outline"
                                                size="icon"
                                                onClick={() => fetchModels(providerBackend === 'vercel' ? 'https://ai-gateway.vercel.sh/v1/models' : baseUrl)}
                                                title={translate('refreshModels', language)}
                                                className="shrink-0"
                                            >
                                                <RefreshCw className={class_name("w-4 h-4", isLoadingModels && "animate-spin")} />
                                            </Button>
                                        </div>
                                    )}
                                    {fetchError && <p className="text-[10px] text-destructive mt-1 flex items-center gap-1"><AlertCircle className="w-3 h-3" /> {fetchError}</p>}
                                </div>
                            </div>
                        )}

                        <div className="space-y-2">
                            <Label htmlFor="api-key-input" className="text-xs uppercase font-bold tracking-wider opacity-70">
                                {providerBackend === 'vercel' ? translate('vercelApiKey', language) : translate('apiKey', language)}
                            </Label>
                            <Input 
                                id="api-key-input"
                                type="password" 
                                value={apiKey} 
                                onChange={(e) => setApiKey(e.target.value)} 
                                placeholder={providerBackend === 'vercel' ? translate('vercelApiKeyPlaceholder', language) : translate('apiKeyPlaceholder', language)} 
                                className={class_name("bg-muted/30 focus-visible:ring-primary", providerBackend === 'vercel' && "border-primary/30")}
                            />
                            <p className="text-[10px] text-muted-foreground opacity-70">
                                {providerBackend === 'vercel' ? translate('vercelApiKeyHint', language) : translate('apiKeyHint', language)}
                            </p>
                            {providerBackend === 'vercel' && (
                                <div className="mt-2 p-2 bg-primary/10 border border-primary/20 rounded text-[10px] text-primary flex items-start gap-2">
                                    <AlertCircle className="w-3 h-3 mt-0.5 shrink-0" />
                                    <span>{translate('vercelVirtualCardNotice', language)}</span>
                                </div>
                            )}
                            
                            {providerBackend === 'vercel' && (
                                <div className="space-y-4 pt-4 border-t border-border/50">
                                    <div className="flex items-center justify-between">
                                        <div className="space-y-0.5">
                                            <Label htmlFor="enable-exa" className="text-sm font-medium cursor-pointer">
                                                {translate('enableExaSearch', language)}
                                            </Label>
                                            <p className="text-[11px] text-muted-foreground">{translate('exaApiKeyHint', language)}</p>
                                        </div>
                                        <Switch 
                                            id="enable-exa" 
                                            checked={exaEnabled} 
                                            onCheckedChange={setExaEnabled}
                                        />
                                    </div>
                                    
                                    {exaEnabled && (
                                        <div className="space-y-2 animate-in fade-in slide-in-from-top-2 duration-300">
                                            <Label htmlFor="exa-api-key" className="text-xs uppercase font-bold tracking-wider opacity-70">
                                                {translate('exaApiKey', language)}
                                            </Label>
                                            <Input 
                                                id="exa-api-key"
                                                type="password" 
                                                value={exaApiKey} 
                                                onChange={(e) => setExaApiKey(e.target.value)} 
                                                placeholder={translate('exaApiKeyPlaceholder', language)}
                                                className="bg-muted/30 focus-visible:ring-primary border-primary/30"
                                            />
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="py-4 px-6 bg-muted/10">
                        <div className="flex items-center justify-between">
                             <div className="flex items-center gap-2">
                                <Palette className="w-4 h-4 text-primary" />
                                <CardTitle className="text-sm">{translate('appearanceAndApp', language)}</CardTitle>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="p-6 space-y-4">
                        <div className="flex items-center justify-between">
                            <div className="space-y-0.5">
                                <Label className="text-sm font-medium">{translate('themeInterface', language)}</Label>
                                <p className="text-[11px] text-muted-foreground">{translate('themeDescription', language)}</p>
                            </div>
                            <Select value={theme} onValueChange={handleThemeChange}>
                                <SelectTrigger className="w-[140px]">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="default">{translate('themeEduPage', language)}</SelectItem>
                                    <SelectItem value="sms">{translate('themeImessage', language)}</SelectItem>
                                    <SelectItem value="gradient">{translate('themeMessenger', language)}</SelectItem>
                                    <SelectItem value="discord">{translate('themeDiscord', language)}</SelectItem>
                                    <SelectItem value="tokyo">{translate('themeTokyo', language)}</SelectItem>
                                    <SelectItem value="mono">{translate('themeMono', language)}</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <Separator className="opacity-50" />

                        <div className="flex items-center justify-between">
                            <div className="space-y-0.5">
                                <Label htmlFor="global-theme-toggle" className="text-sm font-medium cursor-pointer">{translate('applyThemeGlobal', language)}</Label>
                                <p className="text-[11px] text-muted-foreground">{translate('globalThemeDescription', language)}</p>
                            </div>
                            <Switch 
                                id="global-theme-toggle" 
                                checked={globalTheme} 
                                onCheckedChange={handleGlobalThemeChange}
                            />
                        </div>

                        <div className="flex items-center justify-between">
                            <div className="space-y-0.5">
                                <Label htmlFor="auto-update-toggle" className="text-sm font-medium cursor-pointer">{translate('autoUpdate', language)}</Label>
                                <p className="text-[11px] text-muted-foreground">{translate('autoUpdateDescription', language)}</p>
                            </div>
                            <Switch 
                                id="auto-update-toggle" 
                                checked={autoUpdate} 
                                onCheckedChange={handleAutoUpdateChange}
                            />
                        </div>

                        <Separator className="opacity-50" />

                        <div className="space-y-2">
                            <div className="flex items-center gap-2 mb-1">
                                <Languages className="w-4 h-4 text-muted-foreground" />
                                <Label htmlFor="language-select" className="text-xs uppercase font-bold tracking-wider opacity-70">{translate('language', language)}</Label>
                            </div>
                            <Select value={language} onValueChange={onLanguageChange}>
                                <SelectTrigger id="language-select">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="sk">Slovenčina</SelectItem>
                                    <SelectItem value="en">English</SelectItem>
                                    <SelectItem value="cs">Čeština</SelectItem>
                                    <SelectItem value="de">Deutsch</SelectItem>
                                    <SelectItem value="hu">Magyar</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </CardContent>
                </Card>

                <footer className="pt-4 flex flex-col gap-3">
                    <Button id="save-key-btn" className="w-full font-bold shadow-md h-12" onClick={handleSave}>
                        {translate('saveKey', language)}
                    </Button>
                    <Button variant="ghost" className="w-full text-muted-foreground hover:text-foreground underline-offset-4 hover:underline" onClick={onClose}>
                        {translate('backToChat', language)}
                    </Button>
                </footer>
            </div>
        </div>
    );
};
