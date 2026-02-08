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
    providerGemini: string;
    providerChatGPT: string;
    providerClaude: string;
    providerMistral: string;
    providerLMStudio: string;
    providerOllama: string;
    providerVercel: string;
    
    // Provider-specific instructions titles & steps
    geminiInstructionsTitle: string;
    geminiStep1: string;
    geminiStep2: string;
    geminiStep3: string;
    geminiStep4: string;
    geminiStep5: string;
    geminiNote: string;
    geminiTroubleshoot: string;
    
    openaiInstructionsTitle: string;
    openaiStep1: string;
    openaiStep2: string;
    openaiStep3: string;
    openaiStep4: string;
    openaiStep5: string;
    openaiNote: string;
    
    claudeInstructionsTitle: string;
    claudeStep1: string;
    claudeStep2: string;
    claudeStep3: string;
    claudeStep4: string;
    claudeStep5: string;
    claudeStep6: string;
    claudeNote: string;
    
    mistralInstructionsTitle: string;
    mistralStep1: string;
    mistralStep2: string;
    mistralStep3: string;
    mistralStep4: string;
    mistralStep5: string;
    mistralStep6: string;
    mistralNote: string;
    
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
    vercelMode: string;
    vercelDescription: string;
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
    vercelApiKey: string;
    vercelApiKeyPlaceholder: string;
    vercelApiKeyHint: string;
    appearanceAndApp: string;
    themeDescription: string;
    globalThemeDescription: string;
    autoUpdateDescription: string;
    user: string;
    ai: string;
    vercelBadge: string;
    vercelVirtualCardNotice: string;
}
