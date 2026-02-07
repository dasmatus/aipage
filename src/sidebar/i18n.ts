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
    
    // Instructions
    instructionsTitle: string;
    instruction1: string;
    instruction2: string;
    instruction3: string;
    
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
}

export const translations: Record<string, Translation> = {
    // Slovak (Default)
    sk: {
        settingsTitle: 'Nastavenia',
        settingsDescription: 'Vyberte svojho AI poskytovateľa a nakonfigurujte ho nižšie.',
        aiProvider: 'AI Poskytovateľ',
        apiKey: 'API Klúč',
        saveKey: 'Uložiť Klúč',
        backToChat: 'Späť na Chat',
        language: 'Jazyk',
        
        instructionsTitle: 'Ako získať API klúč:',
        instruction1: 'Navštívte konzolu svojho poskytovateľa',
        instruction2: 'Vytvorte nový API klúč',
        instruction3: 'Skopírujte a vložte ho sem',
        
        chatPlaceholder: 'Napíšte správu...',
        errorApiKey: 'Prosím, nastavte svoj API klúč v nastaveniach',
        errorNetwork: 'Chyba siete. Skontrolujte pripojenie.',
        errorGeneral: 'Vyskytla sa chyba. Skúste to znova.',
        
        providerGemini: 'Google Gemini',
        providerChatGPT: 'OpenAI ChatGPT',
        providerClaude: 'Anthropic Claude',
        providerMistral: 'Mistral AI',
        providerLMStudio: 'LM Studio (Lokálne)',
        providerOllama: 'Ollama (Lokálne)',
    },
    
    // English
    en: {
        settingsTitle: 'Settings',
        settingsDescription: 'Choose your AI provider and configure it below.',
        aiProvider: 'AI Provider',
        apiKey: 'API Key',
        saveKey: 'Save Key',
        backToChat: 'Back to Chat',
        language: 'Language',
        
        instructionsTitle: 'How to get an API key:',
        instruction1: 'Visit your provider\'s console',
        instruction2: 'Create a new API key',
        instruction3: 'Copy and paste it here',
        
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
    },
    
    // Czech
    cs: {
        settingsTitle: 'Nastavení',
        settingsDescription: 'Vyberte svého poskytovatele AI a nakonfigurujte jej níže.',
        aiProvider: 'Poskytovatel AI',
        apiKey: 'API Klíč',
        saveKey: 'Uložit Klíč',
        backToChat: 'Zpět na Chat',
        language: 'Jazyk',
        
        instructionsTitle: 'Jak získat API klíč:',
        instruction1: 'Navštivte konzoli svého poskytovatele',
        instruction2: 'Vytvořte nový API klíč',
        instruction3: 'Zkopírujte a vložte jej sem',
        
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
    },
    
    // German
    de: {
        settingsTitle: 'Einstellungen',
        settingsDescription: 'Wählen Sie Ihren KI-Anbieter und konfigurieren Sie ihn unten.',
        aiProvider: 'KI-Anbieter',
        apiKey: 'API-Schlüssel',
        saveKey: 'Schlüssel Speichern',
        backToChat: 'Zurück zum Chat',
        language: 'Sprache',
        
        instructionsTitle: 'So erhalten Sie einen API-Schlüssel:',
        instruction1: 'Besuchen Sie die Konsole Ihres Anbieters',
        instruction2: 'Erstellen Sie einen neuen API-Schlüssel',
        instruction3: 'Kopieren und fügen Sie ihn hier ein',
        
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
    },
    
    // Hungarian
    hu: {
        settingsTitle: 'Beállítások',
        settingsDescription: 'Válassza ki az AI szolgáltatót és konfigurálja alább.',
        aiProvider: 'AI Szolgáltató',
        apiKey: 'API Kulcs',
        saveKey: 'Kulcs Mentése',
        backToChat: 'Vissza a Chathez',
        language: 'Nyelv',
        
        instructionsTitle: 'Hogyan szerezzünk API kulcsot:',
        instruction1: 'Látogassa meg a szolgáltató konzolját',
        instruction2: 'Hozzon létre egy új API kulcsot',
        instruction3: 'Másolja és illessze be ide',
        
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
