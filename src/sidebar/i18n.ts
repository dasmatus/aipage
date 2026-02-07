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
    
    // Provider-specific instructions titles & steps
    geminiInstructionsTitle: string;
    geminiStep1: string;
    geminiStep2: string;
    geminiStep3: string;
    geminiStep4: string;
    geminiStep5: string;
    geminiNote: string;
    
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

    // OCR
    ocrUploadImage: string;
    alertOCRNoText: string;
    alertOCRError: string;
    alertNoImageClipboard: string;
    noModelsFound: string;
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
        geminiStep1: 'Navštívte Google AI Studio',
        geminiStep2: 'Prihláste sa pomocou svojho Google účtu',
        geminiStep3: 'Kliknite na "Get API Key" alebo "Create API Key"',
        geminiStep4: 'Skopírujte vygenerovaný kľúč (začína na AIzaSy...)',
        geminiStep5: 'Vložte ho nižšie a kliknite na "Uložiť kľúč"',
        geminiNote: '⚠️ Váš API kľúč je uložený lokálne a bezpečne vo vašom prehliadači.',

        openaiInstructionsTitle: 'Ako získať OpenAI API kľúč:',
        openaiStep1: 'Navštívte OpenAI Platform',
        openaiStep2: 'Prihláste sa alebo si vytvorte účet',
        openaiStep3: 'Kliknite na "Create new secret key"',
        openaiStep4: 'Skopírujte vygenerovaný kľúč (začína na sk-...)',
        openaiStep5: 'Vložte ho nižšie a kliknite na "Uložiť kľúč"',
        openaiNote: '⚠️ Používanie OpenAI API je spoplatnené na základe tokenov.',

        claudeInstructionsTitle: 'Ako získať Claude API kľúč:',
        claudeStep1: 'Navštívte Anthropic Console',
        claudeStep2: 'Prihláste sa alebo si vytvorte účet',
        claudeStep3: 'Prejdite do sekcie API Keys',
        claudeStep4: 'Kliknite na "Create Key"',
        claudeStep5: 'Skopírujte vygenerovaný kľúč (začína na sk-ant-...)',
        claudeStep6: 'Vložte ho nižšie a kliknite na "Uložiť kľúč"',
        claudeNote: '⚠️ Claude API vyžaduje platený účet.',

        mistralInstructionsTitle: 'Ako získať Mistral API kľúč:',
        mistralStep1: 'Navštívte Mistral Console',
        mistralStep2: 'Prihláste sa alebo si vytvorte účet',
        mistralStep3: 'Prejdite do sekcie API Keys',
        mistralStep4: 'Kliknite na "Create new key"',
        mistralStep5: 'Skopírujte vygenerovaný kľúč',
        mistralStep6: 'Vložte ho nižšie a kliknite na "Uložiť kľúč"',
        mistralNote: '⚠️ Používanie Mistral API je spoplatnené na základe tokenov.',

        lmstudioInstructionsTitle: 'Ako nastaviť LM Studio:',
        lmstudioStep1: 'Stiahnite a nainštalujte z lmstudio.ai',
        lmstudioStep2: 'Otvorte LM Studio a stiahnite si model (napr. Meta Llama 3)',
        lmstudioStep3: 'Prejdite na kartu Local Server (ikona s dvoma šípkami)',
        lmstudioStep4: 'Kliknite na Start Server',
        lmstudioStep5: 'Nižšie zadajte základnú URL (predvolená: http://localhost:1234/v1)',
        lmstudioNote: '⚠️ Spúšťanie modelov lokálne vyžaduje značnú RAM a slušné GPU/CPU.',

        ollamaInstructionsTitle: 'Ako nastaviť Ollama:',
        ollamaStep1: 'Stiahnite a nainštalujte z ollama.com',
        ollamaStep2: 'Otvorte terminál a spustite: ollama run llama3',
        ollamaStep3: 'Počkajte, kým sa sťahovanie dokončí a objaví sa výzva',
        ollamaStep4: 'Nechajte Ollama bežať a zadajte základnú URL nižšie',
        ollamaNote: '⚠️ Na macOS/Linuxe Ollama zvyčajne beží automaticky na pozadí.',
        
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

        ocrUploadImage: 'Nahrať obrázok (OCR)',
        alertOCRNoText: 'Na obrázku sa nenašiel žiadny text.',
        alertOCRError: 'Nepodarilo sa spracovať obrázok.',
        alertNoImageClipboard: 'V schránke sa nenašiel žiadny obrázok.',
        noModelsFound: 'Nenašli sa žiadne modely.',
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
        geminiStep1: 'Visit Google AI Studio',
        geminiStep2: 'Sign in with your Google account',
        geminiStep3: 'Click "Get API Key" or "Create API Key"',
        geminiStep4: 'Copy the generated key (starts with AIzaSy...)',
        geminiStep5: 'Paste it below and click "Save Key"',
        geminiNote: '⚠️ Your API key is stored locally and securely in your browser.',

        openaiInstructionsTitle: 'How to get an OpenAI API key:',
        openaiStep1: 'Visit OpenAI Platform',
        openaiStep2: 'Sign in or create an account',
        openaiStep3: 'Click "Create new secret key"',
        openaiStep4: 'Copy the generated key (starts with sk-...)',
        openaiStep5: 'Paste it below and click "Save Key"',
        openaiNote: '⚠️ OpenAI API usage is billed based on tokens.',

        claudeInstructionsTitle: 'How to get a Claude API key:',
        claudeStep1: 'Visit Anthropic Console',
        claudeStep2: 'Sign in or create an account',
        claudeStep3: 'Go to API Keys section',
        claudeStep4: 'Click "Create Key"',
        claudeStep5: 'Copy the generated key (starts with sk-ant-...)',
        claudeStep6: 'Paste it below and click "Save Key"',
        claudeNote: '⚠️ Claude API requires a paid account.',

        mistralInstructionsTitle: 'How to get a Mistral API key:',
        mistralStep1: 'Visit Mistral Console',
        mistralStep2: 'Sign in or create an account',
        mistralStep3: 'Go to API Keys section',
        mistralStep4: 'Click "Create new key"',
        mistralStep5: 'Copy the generated key',
        mistralStep6: 'Paste it below and click "Save Key"',
        mistralNote: '⚠️ Mistral API usage is billed based on tokens.',

        lmstudioInstructionsTitle: 'How to setup LM Studio:',
        lmstudioStep1: 'Download and install from lmstudio.ai',
        lmstudioStep2: 'Open LM Studio and download a model (e.g. Meta Llama 3)',
        lmstudioStep3: 'Go to Local Server tab (double arrow icon)',
        lmstudioStep4: 'Click Start Server',
        lmstudioStep5: 'Enter base URL below (default: http://localhost:1234/v1)',
        lmstudioNote: '⚠️ Running models locally requires significant RAM and decent GPU/CPU.',

        ollamaInstructionsTitle: 'How to setup Ollama:',
        ollamaStep1: 'Download and install from ollama.com',
        ollamaStep2: 'Open terminal and run: ollama run llama3',
        ollamaStep3: 'Wait for download to finish and prompt to appear',
        ollamaStep4: 'Keep Ollama running and enter base URL below',
        ollamaNote: '⚠️ On macOS/Linux Ollama usually runs automatically in background.',
        
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

        // OCR
        ocrUploadImage: 'Upload Image for OCR',
        alertOCRNoText: 'No text found in the image.',
        alertOCRError: 'Error processing OCR.',
        alertNoImageClipboard: 'No image found in clipboard.',
        noModelsFound: 'No models found.',
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
        geminiStep1: 'Navštivte Google AI Studio',
        geminiStep2: 'Přihlaste se pomocí svého Google účtu',
        geminiStep3: 'Klikněte na "Get API Key" nebo "Create API Key"',
        geminiStep4: 'Zkopírujte vygenerovaný klíč (začíná na AIzaSy...)',
        geminiStep5: 'Vložte jej níže a klikněte na "Uložit klíč"',
        geminiNote: '⚠️ Váš API klíč je uložen lokálně a bezpečně ve vašem prohlížeči.',

        openaiInstructionsTitle: 'Jak získat OpenAI API klíč:',
        openaiStep1: 'Navštivte OpenAI Platform',
        openaiStep2: 'Přihlaste se nebo si vytvořte účet',
        openaiStep3: 'Klikněte na "Create new secret key"',
        openaiStep4: 'Zkopírujte vygenerovaný klíč (začíná na sk-...)',
        openaiStep5: 'Vložte jej níže a klikněte na "Uložit klíč"',
        openaiNote: '⚠️ Používání OpenAI API je zpoplatněno na základě tokenů.',

        claudeInstructionsTitle: 'Jak získat Claude API klíč:',
        claudeStep1: 'Navštivte Anthropic Console',
        claudeStep2: 'Přihlaste se nebo si vytvořte účet',
        claudeStep3: 'Přejděte do sekce API Keys',
        claudeStep4: 'Klikněte na "Create Key"',
        claudeStep5: 'Zkopírujte vygenerovaný klíč (začíná na sk-ant-...)',
        claudeStep6: 'Vložte jej níže a klikněte na "Uložit klíč"',
        claudeNote: '⚠️ Claude API vyžaduje placený účet.',

        mistralInstructionsTitle: 'Jak získat Mistral API klíč:',
        mistralStep1: 'Navštivte Mistral Console',
        mistralStep2: 'Přihlaste se nebo si vytvořte účet',
        mistralStep3: 'Přejděte do sekce API Keys',
        mistralStep4: 'Klikněte na "Create new key"',
        mistralStep5: 'Zkopírujte vygenerovaný klíč',
        mistralStep6: 'Vložte jej níže a klikněte na "Uložit klíč"',
        mistralNote: '⚠️ Používání Mistral API je zpoplatněno na základě tokenů.',

        lmstudioInstructionsTitle: 'Jak nastavit LM Studio:',
        lmstudioStep1: 'Stáhněte a nainstalujte z lmstudio.ai',
        lmstudioStep2: 'Otevřete LM Studio a stáhněte si model (např. Meta Llama 3)',
        lmstudioStep3: 'Přejděte na kartu Local Server (ikona se dvěma šipkami)',
        lmstudioStep4: 'Klikněte na Start Server',
        lmstudioStep5: 'Níže zadejte základní URL (výchozí: http://localhost:1234/v1)',
        lmstudioNote: '⚠️ Spouštění modelů lokálně vyžaduje značnou RAM a slušné GPU/CPU.',

        ollamaInstructionsTitle: 'Jak nastavit Ollama:',
        ollamaStep1: 'Stáhněte a nainstalujte z ollama.com',
        ollamaStep2: 'Otevřete terminál a spusťte: ollama run llama3',
        ollamaStep3: 'Počkejte, až se stahování dokončí a objeví se výzva',
        ollamaStep4: 'Nechte Ollama běžet a zadejte základní URL níže',
        ollamaNote: '⚠️ Na macOS/Linuxu Ollama obvykle běží automaticky na pozadí.',
        
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

        ocrUploadImage: 'Nahrát obrázek (OCR)',
        alertOCRNoText: 'V obrázku nebyl nalezen žádný text.',
        alertOCRError: 'Chyba při zpracování OCR.',
        alertNoImageClipboard: 'Ve schránce nebyl nalezen žádný obrázek.',
        noModelsFound: 'Nebyly nalezeny žádné modely.',
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
        geminiStep1: 'Besuchen Sie Google AI Studio',
        geminiStep2: 'Melden Sie sich mit Ihrem Google-Konto an',
        geminiStep3: 'Klicken Sie auf "Get API Key" oder "Create API Key"',
        geminiStep4: 'Kopieren Sie den generierten Schlüssel (beginnt mit AIzaSy...)',
        geminiStep5: 'Fügen Sie ihn unten ein und klicken Sie auf "Schlüssel Speichern"',
        geminiNote: '⚠️ Ihr API-Schlüssel wird lokal und sicher in Ihrem Browser gespeichert.',

        openaiInstructionsTitle: 'So erhalten Sie einen OpenAI API-Schlüssel:',
        openaiStep1: 'Besuchen Sie OpenAI Platform',
        openaiStep2: 'Melden Sie sich an oder erstellen Sie ein Konto',
        openaiStep3: 'Klicken Sie auf "Create new secret key"',
        openaiStep4: 'Kopieren Sie den generierten Schlüssel (beginnt mit sk-...)',
        openaiStep5: 'Fügen Sie ihn unten ein und klicken Sie auf "Schlüssel Speichern"',
        openaiNote: '⚠️ Die Nutzung der OpenAI API wird nach Tokens abgerechnet.',

        claudeInstructionsTitle: 'So erhalten Sie einen Claude API-Schlüssel:',
        claudeStep1: 'Besuchen Sie Anthropic Console',
        claudeStep2: 'Melden Sie sich an oder erstellen Sie ein Konto',
        claudeStep3: 'Gehen Sie zum Bereich API Keys',
        claudeStep4: 'Klicken Sie auf "Create Key"',
        claudeStep5: 'Kopieren Sie den generierten Schlüssel (beginnt mit sk-ant-...)',
        claudeStep6: 'Fügen Sie ihn unten ein und klicken Sie auf "Schlüssel Speichern"',
        claudeNote: '⚠️ Claude API erfordert ein kostenpflichtiges Konto.',

        mistralInstructionsTitle: 'So erhalten Sie einen Mistral API-Schlüssel:',
        mistralStep1: 'Besuchen Sie Mistral Console',
        mistralStep2: 'Melden Sie sich an oder erstellen Sie ein Konto',
        mistralStep3: 'Gehen Sie zum Bereich API Keys',
        mistralStep4: 'Klicken Sie auf "Create new key"',
        mistralStep5: 'Kopieren Sie den generierten Schlüssel',
        mistralStep6: 'Fügen Sie ihn unten ein und klicken Sie auf "Schlüssel Speichern"',
        mistralNote: '⚠️ Die Nutzung der Mistral API wird nach Tokens abgerechnet.',

        lmstudioInstructionsTitle: 'So richten Sie LM Studio ein:',
        lmstudioStep1: 'Herunterladen und installieren von lmstudio.ai',
        lmstudioStep2: 'Öffnen Sie LM Studio und laden Sie ein Modell herunter (z.B. Meta Llama 3)',
        lmstudioStep3: 'Gehen Sie zum Reiter Local Server (Symbol mit zwei Pfeilen)',
        lmstudioStep4: 'Klicken Sie auf Start Server',
        lmstudioStep5: 'Geben Sie unten die Basis-URL ein (Standard: http://localhost:1234/v1)',
        lmstudioNote: '⚠️ Das lokale Ausführen von Modellen erfordert viel RAM und eine gute GPU/CPU.',

        ollamaInstructionsTitle: 'So richten Sie Ollama ein:',
        ollamaStep1: 'Herunterladen und installieren von ollama.com',
        ollamaStep2: 'Öffnen Sie das Terminal und führen Sie aus: ollama run llama3',
        ollamaStep3: 'Warten Sie, bis der Download abgeschlossen ist und die Eingabeaufforderung erscheint',
        ollamaStep4: 'Lassen Sie Ollama laufen und geben Sie unten die Basis-URL ein',
        ollamaNote: '⚠️ Unter macOS/Linux läuft Ollama normalerweise automatisch im Hintergrund.',
        
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

        ocrUploadImage: 'Bild hochladen (OCR)',
        alertOCRNoText: 'Kein Text im Bild gefunden.',
        alertOCRError: 'Bild konnte nicht verarbeitet werden.',
        alertNoImageClipboard: 'Kein Bild in der Zwischenablage gefunden.',
        noModelsFound: 'Keine Modelle gefunden.',
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
        geminiStep1: 'Látogassa meg a Google AI Studio-t',
        geminiStep2: 'Jelentkezzen be Google fiókjával',
        geminiStep3: 'Kattintson a "Get API Key" vagy "Create API Key" gombra',
        geminiStep4: 'Másolja ki a generált kulcsot (AIzaSy... kezdettel)',
        geminiStep5: 'Illessze be alább és kattintson a "Kulcs Mentése" gombra',
        geminiNote: '⚠️ Az API kulcsa helyileg és biztonságosan a böngészőjében tárolódik.',

        openaiInstructionsTitle: 'Hogyan szerezzünk OpenAI API kulcsot:',
        openaiStep1: 'Látogassa meg az OpenAI Platformot',
        openaiStep2: 'Jelentkezzen be vagy hozzon létre fiókot',
        openaiStep3: 'Kattintson a "Create new secret key" gombra',
        openaiStep4: 'Másolja ki a generált kulcsot (sk-... kezdettel)',
        openaiStep5: 'Illessze be alább és kattintson a "Kulcs Mentése" gombra',
        openaiNote: '⚠️ Az OpenAI API használata token alapú számlázással működik.',

        claudeInstructionsTitle: 'Hogyan szerezzünk Claude API kulcsot:',
        claudeStep1: 'Látogassa meg az Anthropic Console-t',
        claudeStep2: 'Jelentkezzen be vagy hozzon létre fiókot',
        claudeStep3: 'Menjen az API Keys részhez',
        claudeStep4: 'Kattintson a "Create Key" gombra',
        claudeStep5: 'Másolja ki a generált kulcsot (sk-ant-... kezdettel)',
        claudeStep6: 'Illessze be alább és kattintson a "Kulcs Mentése" gombra',
        claudeNote: '⚠️ A Claude API fizetős fiókot igényel.',

        mistralInstructionsTitle: 'Hogyan szerezzünk Mistral API kulcsot:',
        mistralStep1: 'Látogassa meg a Mistral Console-t',
        mistralStep2: 'Jelentkezzen be vagy hozzon létre fiókot',
        mistralStep3: 'Menjen az API Keys részhez',
        mistralStep4: 'Kattintson a "Create new key" gombra',
        mistralStep5: 'Másolja ki a generált kulcsot',
        mistralStep6: 'Illessze be alább és kattintson a "Kulcs Mentése" gombra',
        mistralNote: '⚠️ A Mistral API használata token alapú számlázással működik.',

        lmstudioInstructionsTitle: 'Hogyan állítsuk be az LM Studio-t:',
        lmstudioStep1: 'Töltse le és telepítse az lmstudio.ai oldalról',
        lmstudioStep2: 'Nyissa meg az LM Studio-t és töltsön le egy modellt (pl. Meta Llama 3)',
        lmstudioStep3: 'Menjen a Local Server fülre (két nyíl ikon)',
        lmstudioStep4: 'Kattintson a Start Server gombra',
        lmstudioStep5: 'Adja meg az alap URL-t alább (alapértelmezett: http://localhost:1234/v1)',
        lmstudioNote: '⚠️ A modellek helyi futtatása jelentős RAM-ot és jó GPU/CPU-t igényel.',

        ollamaInstructionsTitle: 'Hogyan állítsuk be az Ollama-t:',
        ollamaStep1: 'Töltse le és telepítse az ollama.com oldalról',
        ollamaStep2: 'Nyissa meg a terminált és futtassa: ollama run llama3',
        ollamaStep3: 'Várja meg a letöltés befejezését és a parancssor megjelenését',
        ollamaStep4: 'Hagyja futni az Ollama-t és adja meg az alap URL-t alább',
        ollamaNote: '⚠️ macOS/Linux rendszereken az Ollama általában automatikusan fut a háttérben.',
        
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

        ocrUploadImage: 'Kép feltöltése (OCR)',
        alertOCRNoText: 'Nem található szöveg a képen.',
        alertOCRError: 'A kép feldolgozása sikertelen.',
        alertNoImageClipboard: 'Nem található kép a vágólapon.',
        noModelsFound: 'Nem található modell.',
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
