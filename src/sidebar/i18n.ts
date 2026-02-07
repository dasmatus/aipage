// i18n - Internationalization for AiPage Sidebar

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
    
    // Instructions
    instructionsTitle: string;
    instruction1: string;
    instruction2: string;
    instruction3: string;
    
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
    
    // Provider-specific instructions titles
    geminiInstructionsTitle: string;
    openaiInstructionsTitle: string;
    claudeInstructionsTitle: string;
    mistralInstructionsTitle: string;
    lmstudioInstructionsTitle: string;
    ollamaInstructionsTitle: string;
    
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
}

export const translations: Record<string, Translation> = {
    // Slovak (Default)
    sk: {
        settingsTitle: 'Vyžaduje sa nastavenie',
        settingsDescription: 'Vyberte svojho AI poskytovateľa a nakonfigurujte ho nižšie.',
        aiProvider: 'Poskytovateľ AI',
        apiKey: 'API kľúč',
        saveKey: 'Uložiť kľúč',
        backToChat: 'Späť do chatu',
        language: 'Jazyk',
        themeInterface: 'Téma rozhrania',
        applyThemeGlobal: 'Aplikovať tému aj na EduPage',
        
        instructionsTitle: 'Ako získať API kľúč:',
        instruction1: 'Navštívte konzolu svojho poskytovateľa',
        instruction2: 'Vytvorte nový API kľúč',
        instruction3: 'Skopírujte a vložte ho sem',
        
        baseUrl: 'Základná URL',
        model: 'Model',
        selectModel: 'Vyberte model',
        refreshModels: '↻ Obnoviť modely',
        loading: 'Načítavam...',
        apiKeyPlaceholder: 'Zadajte svoj API kľúč',
        apiKeyHint: 'Váš kľúč je uložený na vašom zariadení a nikdy sa nezdieľa.',
        
        chatPlaceholder: 'Napíšte správu...',
        errorApiKey: 'Prosím, nastavte svoj API kľúč v nastaveniach',
        errorNetwork: 'Chyba siete. Skontrolujte pripojenie.',
        errorGeneral: 'Vyskytla sa chyba. Skúste to znova.',
        
        providerGemini: 'Google Gemini',
        providerChatGPT: 'OpenAI ChatGPT',
        providerClaude: 'Anthropic Claude',
        providerMistral: 'Mistral AI',
        providerLMStudio: 'LM Studio (Lokálne)',
        providerOllama: 'Ollama (Lokálne)',
        
        geminiInstructionsTitle: 'Ako získať Gemini API kľúč:',
        openaiInstructionsTitle: 'Ako získať OpenAI API kľúč:',
        claudeInstructionsTitle: 'Ako získať Claude API kľúč:',
        mistralInstructionsTitle: 'Ako získať Mistral API kľúč:',
        lmstudioInstructionsTitle: 'Ako nastaviť LM Studio:',
        ollamaInstructionsTitle: 'Ako nastaviť Ollama:',
        
        alertPleaseEnterKey: 'Prosím, zadajte API kľúč',
        alertSettingsSaved: 'Nastavenia uložené!',
        
        analyzePage: 'Analyzovať stránku',
        askAnything: 'Spýtaj sa na čokoľvek...',
        alertContentLoadFailed: 'Nepodarilo sa načítať obsah.',
        alertScanError: 'Chyba pri skenovaní.',

        themeEduPage: 'EduPage (Predvolená)',
        themeImessage: 'iMessage',
        themeMessenger: 'Messenger',
        themeDiscord: 'Discord',
        themeTokyo: 'Tokyo Night',
        themeMono: 'Monochromatická',
    },
    
    // English
    en: {
        settingsTitle: 'Setup Required',
        settingsDescription: 'Choose your AI provider and configure it below.',
        aiProvider: 'AI Provider',
        apiKey: 'API Key',
        saveKey: 'Save Key',
        backToChat: 'Back to Chat',
        language: 'Language',
        themeInterface: 'Interface Theme',
        applyThemeGlobal: 'Apply theme to EduPage',
        
        instructionsTitle: 'How to get an API key:',
        instruction1: 'Visit your provider\'s console',
        instruction2: 'Create a new API key',
        instruction3: 'Copy and paste it here',
        
        baseUrl: 'Base URL',
        model: 'Model',
        selectModel: 'Select model',
        refreshModels: '↻ Refresh models',
        loading: 'Loading...',
        apiKeyPlaceholder: 'Enter your API key',
        apiKeyHint: 'Your key is stored on your device and never shared.',
        
        chatPlaceholder: 'Type a message...',
        errorApiKey: 'Please set your API key in settings',
        errorNetwork: 'Network error. Check your connection.',
        errorGeneral: 'An error occurred. Please try again.',
        
        providerGemini: 'Google Gemini',
        providerChatGPT: 'OpenAI ChatGPT',
        providerClaude: 'Anthropic Claude',
        providerMistral: 'Mistral AI',
        providerLMStudio: 'LM Studio (Local)',
        providerOllama: 'Ollama (Local)',
        
        geminiInstructionsTitle: 'How to get a Gemini API key:',
        openaiInstructionsTitle: 'How to get an OpenAI API key:',
        claudeInstructionsTitle: 'How to get a Claude API key:',
        mistralInstructionsTitle: 'How to get a Mistral API key:',
        lmstudioInstructionsTitle: 'How to setup LM Studio:',
        ollamaInstructionsTitle: 'How to setup Ollama:',
        
        alertPleaseEnterKey: 'Please enter an API key',
        alertSettingsSaved: 'Settings saved!',
        
        analyzePage: 'Analyze Page',
        askAnything: 'Ask anything...',
        alertContentLoadFailed: 'Failed to load content.',
        alertScanError: 'Scanning error.',

        themeEduPage: 'EduPage (Default)',
        themeImessage: 'iMessage',
        themeMessenger: 'Messenger',
        themeDiscord: 'Discord',
        themeTokyo: 'Tokyo Night',
        themeMono: 'Monochromatic',
    },
    
    // Czech
    cs: {
        settingsTitle: 'Vyžadováno nastavení',
        settingsDescription: 'Vyberte svého poskytovatele AI a nakonfigurujte jej níže.',
        aiProvider: 'Poskytovatel AI',
        apiKey: 'API Klíč',
        saveKey: 'Uložit Klíč',
        backToChat: 'Zpět na Chat',
        language: 'Jazyk',
        themeInterface: 'Téma rozhraní',
        applyThemeGlobal: 'Aplikovat téma na EduPage',
        
        instructionsTitle: 'Jak získat API klíč:',
        instruction1: 'Navštivte konzoli svého poskytovatele',
        instruction2: 'Vytvořte nový API klíč',
        instruction3: 'Zkopírujte a vložte jej sem',
        
        baseUrl: 'Základní URL',
        model: 'Model',
        selectModel: 'Vyberte model',
        refreshModels: '↻ Obnovit modely',
        loading: 'Načítám...',
        apiKeyPlaceholder: 'Zadejte svůj API klíč',
        apiKeyHint: 'Váš klíč je uložen na vašem zařízení a nikdy se nesdílí.',
        
        chatPlaceholder: 'Napište zprávu...',
        errorApiKey: 'Prosím, nastavte svůj API klíč v nastavení',
        errorNetwork: 'Chyba sítě. Zkontrolujte připojení.',
        errorGeneral: 'Došlo k chybě. Zkuste to znovu.',
        
        providerGemini: 'Google Gemini',
        providerChatGPT: 'OpenAI ChatGPT',
        providerClaude: 'Anthropic Claude',
        providerMistral: 'Mistral AI',
        providerLMStudio: 'LM Studio (Místní)',
        providerOllama: 'Ollama (Místní)',
        
        geminiInstructionsTitle: 'Jak získat Gemini API klíč:',
        openaiInstructionsTitle: 'Jak získat OpenAI API klíč:',
        claudeInstructionsTitle: 'Jak získat Claude API klíč:',
        mistralInstructionsTitle: 'Jak získat Mistral API klíč:',
        lmstudioInstructionsTitle: 'Jak nastavit LM Studio:',
        ollamaInstructionsTitle: 'Jak nastavit Ollama:',
        
        alertPleaseEnterKey: 'Prosím, zadejte API klíč',
        alertSettingsSaved: 'Nastavení uloženo!',
        
        analyzePage: 'Analyzovat stránku',
        askAnything: 'Zeptej se na cokoliv...',
        alertContentLoadFailed: 'Nepodařilo se načíst obsah.',
        alertScanError: 'Chyba při skenování.',

        themeEduPage: 'EduPage (Výchozí)',
        themeImessage: 'iMessage',
        themeMessenger: 'Messenger',
        themeDiscord: 'Discord',
        themeTokyo: 'Tokyo Night',
        themeMono: 'Monochromatická',
    },
    
    // German
    de: {
        settingsTitle: 'Einrichtung erforderlich',
        settingsDescription: 'Wählen Sie Ihren KI-Anbieter und konfigurieren Sie ihn unten.',
        aiProvider: 'KI-Anbieter',
        apiKey: 'API-Schlüssel',
        saveKey: 'Schlüssel Speichern',
        backToChat: 'Zurück zum Chat',
        language: 'Sprache',
        themeInterface: 'Oberflächenthema',
        applyThemeGlobal: 'Design auf EduPage anwenden',
        
        instructionsTitle: 'So erhalten Sie einen API-Schlüssel:',
        instruction1: 'Besuchen Sie die Konsole Ihres Anbieters',
        instruction2: 'Erstellen Sie einen neuen API-Schlüssel',
        instruction3: 'Kopieren und fügen Sie ihn hier ein',
        
        baseUrl: 'Basis-URL',
        model: 'Modell',
        selectModel: 'Wählen Sie das Modell',
        refreshModels: '↻ Modelle aktualisieren',
        loading: 'Wird geladen...',
        apiKeyPlaceholder: 'Geben Sie Ihren API-Schlüssel ein',
        apiKeyHint: 'Ihr Schlüssel wird auf Ihrem Gerät gespeichert und niemals geteilt.',
        
        chatPlaceholder: 'Nachricht eingeben...',
        errorApiKey: 'Bitte legen Sie Ihren API-Schlüssel in den Einstellungen fest',
        errorNetwork: 'Netzwerkfehler. Überprüfen Sie Ihre Verbindung.',
        errorGeneral: 'Ein Fehler ist aufgetreten. Bitte versuchen Sie es erneut.',
        
        providerGemini: 'Google Gemini',
        providerChatGPT: 'OpenAI ChatGPT',
        providerClaude: 'Anthropic Claude',
        providerMistral: 'Mistral AI',
        providerLMStudio: 'LM Studio (Lokal)',
        providerOllama: 'Ollama (Lokal)',
        
        geminiInstructionsTitle: 'So erhalten Sie einen Gemini API-Schlüssel:',
        openaiInstructionsTitle: 'So erhalten Sie einen OpenAI API-Schlüssel:',
        claudeInstructionsTitle: 'So erhalten Sie einen Claude API-Schlüssel:',
        mistralInstructionsTitle: 'So erhalten Sie einen Mistral API-Schlüssel:',
        lmstudioInstructionsTitle: 'So richten Sie LM Studio ein:',
        ollamaInstructionsTitle: 'So richten Sie Ollama ein:',
        
        alertPleaseEnterKey: 'Bitte geben Sie einen API-Schlüssel ein',
        alertSettingsSaved: 'Einstellungen gespeichert!',
        
        analyzePage: 'Seite analysieren',
        askAnything: 'Frag irgendetwas...',
        alertContentLoadFailed: 'Inhalt konnte nicht geladen werden.',
        alertScanError: 'Scan-Fehler.',

        themeEduPage: 'EduPage (Standard)',
        themeImessage: 'iMessage',
        themeMessenger: 'Messenger',
        themeDiscord: 'Discord',
        themeTokyo: 'Tokyo Night',
        themeMono: 'Monochrom',
    },
    
    // Hungarian
    hu: {
        settingsTitle: 'Beállítás szükséges',
        settingsDescription: 'Válassza ki az AI szolgáltatót és konfigurálja alább.',
        aiProvider: 'AI Szolgáltató',
        apiKey: 'API Kulcs',
        saveKey: 'Kulcs Mentése',
        backToChat: 'Vissza a Chathez',
        language: 'Nyelv',
        themeInterface: 'Felület téma',
        applyThemeGlobal: 'Téma alkalmazása az EduPage-re',
        
        instructionsTitle: 'Hogyan szerezzünk API kulcsot:',
        instruction1: 'Látogassa meg a szolgáltató konzolját',
        instruction2: 'Hozzon létre egy új API kulcsot',
        instruction3: 'Másolja és illessze be ide',
        
        baseUrl: 'Alap URL',
        model: 'Modell',
        selectModel: 'Válasszon modellt',
        refreshModels: '↻ Modellek frissítése',
        loading: 'Betöltés...',
        apiKeyPlaceholder: 'Adja meg API kulcsát',
        apiKeyHint: 'A kulcs az eszközén tárolódik és soha nem osztjuk meg.',
        
        chatPlaceholder: 'Írjon üzenetet...',
        errorApiKey: 'Kérjük, állítsa be az API kulcsot a beállításokban',
        errorNetwork: 'Hálózati hiba. Ellenőrizze a kapcsolatot.',
        errorGeneral: 'Hiba történt. Kérjük, próbálja újra.',
        
        providerGemini: 'Google Gemini',
        providerChatGPT: 'OpenAI ChatGPT',
        providerClaude: 'Anthropic Claude',
        providerMistral: 'Mistral AI',
        providerLMStudio: 'LM Studio (Helyi)',
        providerOllama: 'Ollama (Helyi)',
        
        geminiInstructionsTitle: 'Hogyan szerezzünk Gemini API kulcsot:',
        openaiInstructionsTitle: 'Hogyan szerezzünk OpenAI API kulcsot:',
        claudeInstructionsTitle: 'Hogyan szerezzünk Claude API kulcsot:',
        mistralInstructionsTitle: 'Hogyan szerezzünk Mistral API kulcsot:',
        lmstudioInstructionsTitle: 'Hogyan állítsuk be az LM Studio-t:',
        ollamaInstructionsTitle: 'Hogyan állítsuk be az Ollama-t:',
        
        alertPleaseEnterKey: 'Kérjük, adjon meg egy API kulcsot',
        alertSettingsSaved: 'Beállítások mentve!',
        
        analyzePage: 'Oldal elemzése',
        askAnything: 'Kérdezz bármit...',
        alertContentLoadFailed: 'Sikertelen tartalom betöltés.',
        alertScanError: 'Szkennelési hiba.',

        themeEduPage: 'EduPage (Alapértelmezett)',
        themeImessage: 'iMessage',
        themeMessenger: 'Messenger',
        themeDiscord: 'Discord',
        themeTokyo: 'Tokyo Night',
        themeMono: 'Monokróm',
    },
};

// Get translation for current language
export function t(key: keyof Translation, lang: string = 'sk'): string {
    const translation = translations[lang] || translations['sk'];
    return translation[key] || translations['sk'][key];
}

// Get current language from storage or default
export async function getCurrentLanguage(): Promise<string> {
    try {
        const result = await chrome.storage.local.get('language');
        return result.language || 'sk';
    } catch (error) {
        console.error('Failed to get language:', error);
        return 'sk';
    }
}

// Set language in storage
export async function setLanguage(lang: string): Promise<void> {
    try {
        await chrome.storage.local.set({ language: lang });
    } catch (error) {
        console.error('Failed to set language:', error);
    }
}
