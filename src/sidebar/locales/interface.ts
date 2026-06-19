export interface Translation {
    // Settings
    settingsTitle: string;
    settingsDescription: string;
    aiProvider: string;
    apiKey: string;
    saveKey: string;
    backToChat: string;
    language: string;
    themeInterface: string;
    applyThemeGlobal: string;
    autoUpdate: string;
    
    // Instructions
    instructionsTitle: string;
    
    // Input labels and hints
    baseUrl: string;
    model: string;
    selectModel: string;
    refreshModels: string;
    loading: string;
    apiKeyPlaceholder: string;
    apiKeyHint: string;
    
    // Chat Interface
    analyzePage: string;
    askAnything: string;
    
    // App Alerts
    alertContentLoadFailed: string;
    alertScanError: string;
    
    // Chat
    chatPlaceholder: string;
    send: string;
    errorApiKey: string;
    errorNetwork: string;
    errorGeneral: string;
    
    // Providers
    providerLMStudio: string;
    providerOllama: string;
    providerAnthropic: string;
    
    // Provider-specific instructions titles & steps
    lmstudioInstructionsTitle: string;
    lmstudioStep1: string;
    lmstudioStep2: string;
    lmstudioStep3: string;
    lmstudioStep4: string;
    lmstudioStep5: string;
    lmstudioNote: string;
    
    ollamaInstructionsTitle: string;
    ollamaStep1: string;
    ollamaStep2: string;
    ollamaStep3: string;
    ollamaStep4: string;
    ollamaNote: string;
    
    // Alert messages
    alertPleaseEnterKey: string;
    alertSettingsSaved: string;

    // Themes
    themeEduPage: string;
    themeImessage: string;
    themeMessenger: string;
    themeDiscord: string;
    themeTokyo: string;
    themeMono: string;

    noModelsFound: string;
    settings: string;
    chat: string;
    engineMode: string;
    standardMode: string;
    anthropicMode: string;
    anthropicDescription: string;
    standardDescription: string;
    providerEngine: string;
    selectEngine: string;
    selectProvider: string;
    modelAndAuth: string;
    free: string;
    searchPlaceholder: string;
    search: string;
    closeSearch: string;
    searchWeb: string;
    anthropicApiKey: string;
    anthropicApiKeyPlaceholder: string;
    anthropicApiKeyHint: string;
    appearanceAndApp: string;
    themeDescription: string;
    globalThemeDescription: string;
    autoUpdateDescription: string;
    user: string;
    ai: string;
    anthropicBadge: string;
    anthropicGetKeyNotice: string;

    // Exa
    exaApiKey: string;
    exaApiKeyPlaceholder: string;
    exaApiKeyHint: string;
    enableExaSearch: string;

    // SearXNG
    searxngSearch: string;
    searxngEnabled: string;
    searxngUrl: string;
    searxngUrlPlaceholder: string;
    searxngUrlHint: string;

    // Image Generation
    imageGen: string;
    imageGenEnabled: string;
    imageGenPromptPlaceholder: string;
    imageGenProvider: string;
    imageGenClaudeSvg: string;
    imageGenClaudeSvgHint: string;
    imageGenSDWebUI: string;
    imageGenSdUrl: string;
    imageGenSdUrlPlaceholder: string;
    imageGenModel: string;
    imageGenSize: string;
    imageGenGenerating: string;
    imageGenFailed: string;

    // Navigation
    widgets: string;
}
