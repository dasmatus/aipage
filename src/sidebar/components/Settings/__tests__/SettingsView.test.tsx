
import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { SettingsView } from '../SettingsView';
import * as Storage from '../../../storage';
import { ProviderType } from '../../../types';
import browser from '../../../../polyfills/browser-polyfill';

// Mock webextension-polyfill
jest.mock('webextension-polyfill', () => ({
    storage: {
        local: {
            get: jest.fn(() => Promise.resolve({})),
            set: jest.fn(() => Promise.resolve()),
        }
    },
    runtime: {
        sendMessage: jest.fn(),
        onMessage: { addListener: jest.fn() },
    }
}));

// Mock browser polyfill
jest.mock('../../../../polyfills/browser-polyfill', () => ({
    storage: {
        local: {
            get: jest.fn(() => Promise.resolve({})),
            set: jest.fn(() => Promise.resolve()),
        }
    }
}));

// Mock Storage but keep constants
jest.mock('../../../storage', () => {
    const original = jest.requireActual('../../../storage');
    return {
        ...original,
        getApiKey: jest.fn(),
        getThemePreference: jest.fn(),
        getLocalSettings: jest.fn(),
        saveLocalSettings: jest.fn(),
        saveThemePreference: jest.fn(),
    };
});

// Mock providers
jest.mock('../../../providers', () => ({
    getProvider: jest.fn(() => ({
        getModels: jest.fn().mockResolvedValue(['model1', 'model2']),
    })),
    // Also likely needs this mock since it might be used
    ProviderType: {
        GEMINI: 'gemini',
        CLAUDE: 'claude',
        OPENAI: 'openai',
        LMSTUDIO: 'lmstudio',
        OLLAMA: 'ollama',
    }
}));

// Mock i18n
jest.mock('../../../i18n', () => ({
    t: (k: string) => k,
}));

describe('SettingsView', () => {
    const mockOnClose = jest.fn();
    const mockOnProviderChange = jest.fn();
    const mockOnLanguageChange = jest.fn();

    beforeEach(() => {
        jest.clearAllMocks();
        (Storage.getApiKey as jest.Mock).mockResolvedValue('test-key');
        (Storage.getThemePreference as jest.Mock).mockResolvedValue('default');
        (Storage.getLocalSettings as jest.Mock).mockResolvedValue({ url: '', model: '' });
    });

    it('renders correctly', async () => {
        await act(async () => {
            render(
                <SettingsView
                    currentProvider="gemini"
                    onClose={mockOnClose}
                    onProviderChange={mockOnProviderChange}
                    language="en"
                    onLanguageChange={mockOnLanguageChange}
                />
            );
        });

        expect(screen.getByDisplayValue('test-key')).toBeInTheDocument();
        expect(screen.getByText('saveKey')).toBeInTheDocument();
    });

    it('updates API key and saves', async () => {
        await act(async () => {
            render(
                <SettingsView
                    currentProvider="gemini"
                    onClose={mockOnClose}
                    onProviderChange={mockOnProviderChange}
                    language="en"
                    onLanguageChange={mockOnLanguageChange}
                />
            );
        });

        const input = screen.getByPlaceholderText('apiKeyPlaceholder');
        fireEvent.change(input, { target: { value: 'new-key' } });
        
        const saveBtn = screen.getByText('saveKey');
        await act(async () => {
            fireEvent.click(saveBtn);
        });

        // Check if browser.storage.local.set was called with correct key
        // gemini key is gemini_api_key
        expect(browser.storage.local.set).toHaveBeenCalledWith(
            expect.objectContaining({ gemini_api_key: 'new-key' })
        );
        expect(mockOnClose).toHaveBeenCalled();
    });

    it('handles local provider settings', async () => {
         await act(async () => {
            render(
                <SettingsView
                    currentProvider="lmstudio"
                    onClose={mockOnClose}
                    onProviderChange={mockOnProviderChange}
                    language="en"
                    onLanguageChange={mockOnLanguageChange}
                />
            );
        });

        expect(screen.getByText('refreshModels')).toBeInTheDocument();
        
        // Mock getModels to work
        const refreshBtn = screen.getByText('refreshModels');
        await act(async () => {
            fireEvent.click(refreshBtn);
        });

        // Should populate models
        expect(screen.getByText('model1')).toBeInTheDocument();
    });
});
