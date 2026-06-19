import React, { useState, useEffect, useRef } from 'react';
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
import { RefreshCw, Zap, Settings2, Palette, Languages, AlertCircle, ImageIcon, Wand2 } from 'lucide-react';
import { cn } from '../../lib/utils';

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
    const [autoUpdate, setAutoUpdate] = useState(false);
    const [providerBackend, setProviderBackend] = useState<'anthropic' | 'ollama' | 'lmstudio'>('anthropic');

    // Local settings
    const [baseUrl, setBaseUrl] = useState('');
    const [modelName, setModelName] = useState('');
    const [availableModels, setAvailableModels] = useState<any[]>([]);
    const [isLoadingModels, setIsLoadingModels] = useState(false);
    const [fetchError, setFetchError] = useState<string | null>(null);

    // Auto-answer
    const [autoAnswerEnabled, setAutoAnswerEnabled] = useState(false);

    // Image generation
    const [imageGenEnabled, setImageGenEnabled] = useState(false);
    const [imageGenProvider, setImageGenProvider] = useState<'claude-svg' | 'sdwebui'>('claude-svg');
    const [imageGenSdUrl, setImageGenSdUrl] = useState('http://localhost:7860');
    const [imageGenModel, setImageGenModel] = useState('claude-opus-4-8');
    const [imageGenSize, setImageGenSize] = useState('1024x1024');
    const settingsLoaded = useRef(false);

    useEffect(() => {
        loadSettings();
    }, [currentProvider]);

    const loadSettings = async () => {
        const key = await Storage.getApiKey(currentProvider);
        setApiKey(key || '');

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

        const autoAns = await Storage.getAutoAnswerEnabled();
        setAutoAnswerEnabled(autoAns);

        const imgEn = await Storage.getImageGenEnabled();
        setImageGenEnabled(imgEn);
        const imgProv = await Storage.getImageGenProvider();
        setImageGenProvider(imgProv);
        const imgSdUrl = await Storage.getImageGenSdUrl();
        setImageGenSdUrl(imgSdUrl);
        const imgModel = await Storage.getImageGenModel();
        setImageGenModel(imgModel);
        const imgSize = await Storage.getImageGenSize();
        setImageGenSize(imgSize);

        if (backend === 'lmstudio' || backend === 'ollama') {
            const defaultUrl = backend === 'lmstudio' ? 'http://localhost:1234/v1' : 'http://localhost:11434';
            const url = local.url || defaultUrl;
            setBaseUrl(url);
            fetchModels(url, key || '');
        } else if (backend === 'anthropic') {
            fetchModels('https://api.anthropic.com/v1/models', key || '');
        }

        settingsLoaded.current = true;
    };

    const fetchModels = async (url: string, manualKey?: string) => {
        if (!url) return;
        setIsLoadingModels(true);
        setFetchError(null);
        try {
            const p = getProvider(currentProvider);
            if (p.getModels) {
                const effectiveKey = manualKey !== undefined ? manualKey : apiKey;
                const models = await p.getModels(effectiveKey, { baseUrl: url, type: 'chat' });
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

        await Storage.saveAutoAnswerEnabled(autoAnswerEnabled);
        await Storage.saveImageGenEnabled(imageGenEnabled);
        await Storage.saveImageGenProvider(imageGenProvider);
        await Storage.saveImageGenSdUrl(imageGenSdUrl);
        await Storage.saveImageGenModel(imageGenModel);
        await Storage.saveImageGenSize(imageGenSize);

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

    const handleBackendChange = async (value: 'anthropic' | 'ollama' | 'lmstudio') => {
        setProviderBackend(value);
        await Storage.saveProviderBackendPreference(value);
        onProviderChange(value); // Directly map backend to provider
    };

    const renderInstructions = () => {
        if (providerBackend === 'anthropic') return null;

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

        const inst = instructions[providerBackend];
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
                </CardContent>
            </Card>
        );
    };

    const cardIconTile = (gradient: string, icon: React.ReactNode) => (
        <div
            className="w-[22px] h-[22px] rounded-lg flex items-center justify-center shrink-0"
            style={{ background: gradient }}
        >
            <span className="text-white [&_svg]:w-[11px] [&_svg]:h-[11px]">{icon}</span>
        </div>
    );

    return (
        <div
            className="flex flex-col h-full overflow-y-auto px-4 py-6 selection:bg-primary selection:text-primary-foreground"
            style={{ background: 'var(--bg-color)' }}
        >
            <div className="max-w-[500px] mx-auto w-full space-y-6">
                <header className="flex flex-col gap-1">
                    <h2 className="text-2xl font-bold tracking-tight text-foreground">{translate('settingsTitle', language)}</h2>
                    <p className="text-sm text-muted-foreground">{translate('settingsDescription', language)}</p>
                </header>

                <Card className={cn("overflow-hidden transition-all duration-300",
                            providerBackend === 'anthropic' && "border-primary/50 shadow-lg shadow-primary/10")}>
                    <CardHeader className="space-y-1 bg-muted/30">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                {cardIconTile('linear-gradient(135deg, #2c70a3, #3b82f6)', <Zap />)}
                                <CardTitle className="text-base">{translate('providerEngine', language)}</CardTitle>
                            </div>
                        </div>
                        <CardDescription>
                            {providerBackend === 'anthropic'
                                ? translate('anthropicDescription', language)
                                : translate('standardDescription', language)}
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="pt-6 space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="backend-select" className="text-xs uppercase font-bold tracking-wider opacity-70">{translate('engineMode', language)}</Label>
                            <Select value={providerBackend} onValueChange={(v) => handleBackendChange(v as 'anthropic' | 'ollama' | 'lmstudio')}>
                                <SelectTrigger className={cn(providerBackend === 'anthropic' && "border-primary ring-primary")}>
                                    <SelectValue placeholder={translate('selectEngine', language)} />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="anthropic" className="flex items-center gap-2">
                                        {translate('anthropicMode', language)}
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

                {renderInstructions()}

                <Card>
                    <CardHeader className="py-4 px-6 bg-muted/10">
                        <div className="flex items-center gap-2">
                            {cardIconTile('linear-gradient(135deg, #0369a1, #38bdf8)', <Settings2 />)}
                            <CardTitle className="text-sm">{translate('modelAndAuth', language)}</CardTitle>
                        </div>
                    </CardHeader>
                    <CardContent className="p-6 space-y-6">
                        {(providerBackend === 'ollama' || providerBackend === 'lmstudio' || providerBackend === 'anthropic') && (
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
                                                <SelectTrigger className={cn("flex-1", availableModels.length === 0 && "border-destructive/50")}>
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
                                                onClick={() => fetchModels(providerBackend === 'anthropic' ? 'https://api.anthropic.com/v1/models' : baseUrl)}
                                                title={translate('refreshModels', language)}
                                                className="shrink-0"
                                            >
                                                <RefreshCw className={cn("w-4 h-4", isLoadingModels && "animate-spin")} />
                                            </Button>
                                        </div>
                                    )}
                                    {fetchError && <p className="text-[10px] text-destructive mt-1 flex items-center gap-1"><AlertCircle className="w-3 h-3" /> {fetchError}</p>}
                                </div>
                            </div>
                        )}

                        <div className="space-y-2">
                            <Label htmlFor="api-key-input" className="text-xs uppercase font-bold tracking-wider opacity-70">
                                {providerBackend === 'anthropic' ? translate('anthropicApiKey', language) : translate('apiKey', language)}
                            </Label>
                            <Input
                                id="api-key-input"
                                type="password"
                                value={apiKey}
                                onChange={(e) => setApiKey(e.target.value)}
                                placeholder={providerBackend === 'anthropic' ? translate('anthropicApiKeyPlaceholder', language) : translate('apiKeyPlaceholder', language)}
                                className={cn("bg-muted/30 focus-visible:ring-primary", providerBackend === 'anthropic' && "border-primary/30")}
                            />
                            <p className="text-[10px] text-muted-foreground opacity-70">
                                {providerBackend === 'anthropic' ? translate('anthropicApiKeyHint', language) : translate('apiKeyHint', language)}
                            </p>
                            {providerBackend === 'anthropic' && (
                                <div className="mt-2 p-2 bg-primary/10 border border-primary/20 rounded text-[10px] text-primary flex items-start gap-2">
                                    <AlertCircle className="w-3 h-3 mt-0.5 shrink-0" />
                                    <span>{translate('anthropicGetKeyNotice', language)}</span>
                                </div>
                            )}
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="py-4 px-6 bg-muted/10">
                        <div className="flex items-center justify-between">
                             <div className="flex items-center gap-2">
                                {cardIconTile('linear-gradient(135deg, #2e7d32, #4ade80)', <Palette />)}
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

                {/* Image Generation */}
                <Card>
                    <CardHeader className="py-4 px-6 bg-muted/10">
                        <div className="flex items-center gap-2">
                            {cardIconTile('linear-gradient(135deg, #db2777, #f472b6)', <ImageIcon />)}
                            <CardTitle className="text-sm">{translate('imageGen', language)}</CardTitle>
                        </div>
                    </CardHeader>
                    <CardContent className="p-6 space-y-4">
                        <div className="flex items-center justify-between">
                            <Label htmlFor="image-gen-toggle" className="text-sm font-medium cursor-pointer">{translate('imageGenEnabled', language)}</Label>
                            <Switch id="image-gen-toggle" checked={imageGenEnabled} onCheckedChange={setImageGenEnabled} />
                        </div>
                        {imageGenEnabled && (
                            <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                                <div className="space-y-2">
                                    <Label className="text-xs uppercase font-bold tracking-wider opacity-70">{translate('imageGenProvider', language)}</Label>
                                    <Select value={imageGenProvider} onValueChange={(v) => setImageGenProvider(v as 'claude-svg' | 'sdwebui')}>
                                        <SelectTrigger className="bg-muted/30">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="claude-svg">{translate('imageGenClaudeSvg', language)}</SelectItem>
                                            <SelectItem value="sdwebui">{translate('imageGenSDWebUI', language)}</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                {imageGenProvider === 'claude-svg' && (
                                    <div className="space-y-2">
                                        <Label className="text-xs uppercase font-bold tracking-wider opacity-70">{translate('imageGenSize', language)}</Label>
                                        <Select value={imageGenSize} onValueChange={setImageGenSize}>
                                            <SelectTrigger className="bg-muted/30">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="1024x1024">1024×1024</SelectItem>
                                                <SelectItem value="1024x1792">1024×1792 (Portrait)</SelectItem>
                                                <SelectItem value="1792x1024">1792×1024 (Landscape)</SelectItem>
                                            </SelectContent>
                                        </Select>
                                        <p className="text-[10px] text-muted-foreground opacity-70">{translate('imageGenClaudeSvgHint', language)}</p>
                                    </div>
                                )}
                                {imageGenProvider === 'sdwebui' && (
                                    <div className="space-y-2">
                                        <Label htmlFor="sd-url" className="text-xs uppercase font-bold tracking-wider opacity-70">{translate('imageGenSdUrl', language)}</Label>
                                        <Input
                                            id="sd-url"
                                            value={imageGenSdUrl}
                                            onChange={(e) => setImageGenSdUrl(e.target.value)}
                                            placeholder={translate('imageGenSdUrlPlaceholder', language)}
                                            className="bg-muted/30 focus-visible:ring-primary"
                                        />
                                    </div>
                                )}
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Exam Tools */}
                <Card>
                    <CardHeader className="py-4 px-6 bg-muted/10">
                        <div className="flex items-center gap-2">
                            {cardIconTile('linear-gradient(135deg, #7c3aed, #a78bfa)', <Wand2 />)}
                            <CardTitle className="text-sm">Exam Tools</CardTitle>
                        </div>
                    </CardHeader>
                    <CardContent className="p-6 space-y-4">
                        <div className="flex items-center justify-between">
                            <div className="space-y-0.5">
                                <Label htmlFor="auto-answer-toggle" className="text-sm font-medium cursor-pointer">Auto-answer mode</Label>
                                <p className="text-[11px] text-muted-foreground">Shows a wand button in chat to detect and auto-fill exam answers.</p>
                            </div>
                            <Switch id="auto-answer-toggle" checked={autoAnswerEnabled} onCheckedChange={setAutoAnswerEnabled} />
                        </div>
                    </CardContent>
                </Card>

                <footer className="pt-4 flex flex-col gap-3">
                    <Button
                        id="save-key-btn"
                        className="w-full font-bold h-11 rounded-xl text-white border-0"
                        style={{ background: 'var(--message-user-bg)', boxShadow: '0 4px 14px color-mix(in srgb, var(--accent-color) 28%, transparent)' }}
                        onClick={handleSave}
                    >
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
