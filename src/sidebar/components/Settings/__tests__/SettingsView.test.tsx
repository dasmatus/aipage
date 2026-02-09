
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

// Mock Shadcn UI components to render simply for testing
jest.mock('../../ui/select', () => ({
    Select: ({ children, value, onValueChange }: any) => <select value={value} onChange={(e) => onValueChange(e.target.value)}>{children}</select>,
    SelectTrigger: ({ children }: any) => <div>{children}</div>,
    SelectValue: ({ placeholder }: any) => <span>{placeholder}</span>,
    SelectContent: ({ children }: any) => <>{children}</>,
    SelectItem: ({ children, value }: any) => <option value={value}>{children}</option>,
    SelectGroup: ({ children }: any) => <optgroup>{children}</optgroup>,
    SelectLabel: ({ children }: any) => <option disabled>{children}</option>,
    SelectSeparator: () => <hr />,
}));

jest.mock('../../ui/switch', () => ({
    Switch: ({ checked, onCheckedChange }: any) => <input type="checkbox" checked={checked} onChange={(e) => onCheckedChange(e.target.checked)} />,
}));

jest.mock('../../ui/button', () => ({
    Button: ({ children, onClick, title, id, ...props }: any) => <button id={id} onClick={onClick} title={title}>{children}</button>,
}));

jest.mock('../../ui/input', () => ({
    Input: (props: any) => <input {...props} />,
}));

jest.mock('../../ui/card', () => ({
    Card: ({ children, className }: any) => <div className={className}>{children}</div>,
    CardHeader: ({ children }: any) => <div>{children}</div>,
    CardTitle: ({ children }: any) => <h3>{children}</h3>,
    CardDescription: ({ children }: any) => <p>{children}</p>,
    CardContent: ({ children, className }: any) => <div className={className}>{children}</div>,
    CardFooter: ({ children }: any) => <div>{children}</div>,
}));

jest.mock('../../ui/label', () => ({
    Label: ({ children, htmlFor }: any) => <label htmlFor={htmlFor}>{children}</label>,
}));

jest.mock('../../ui/separator', () => ({
    Separator: () => <hr />,
}));

// Mock browser polyfill
// Mock browser polyfill
jest.mock('../../../../polyfills/browser-polyfill', () => {
    const mockBrowser = {
        storage: {
            local: {
                get: jest.fn(() => Promise.resolve({})),
                set: jest.fn(() => Promise.resolve()),
            }
        },
        runtime: {
             getURL: jest.fn(),
             sendMessage: jest.fn(),
        }
    };
    return {
        __esModule: true,
        default: mockBrowser,
        ...mockBrowser, // for named exports if any are used
    };
});

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
        getExaApiKey: jest.fn(),
        saveExaApiKey: jest.fn(),
        getExaEnabled: jest.fn(),
        saveExaEnabled: jest.fn(),
    };
});

// Mock providers
jest.mock('../../../providers', () => ({
    getProvider: jest.fn(() => ({
        getModels: jest.fn().mockResolvedValue([{ id: 'model1', provider: 'Test' }, { id: 'model2', provider: 'Test' }]),
    })),
    providers: {},
    ProviderType: {
        LMSTUDIO: 'lmstudio',
        OLLAMA: 'ollama',
        VERCEL: 'vercel',
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
        (Storage.getExaApiKey as jest.Mock).mockResolvedValue('exa-initial');
        (Storage.getExaEnabled as jest.Mock).mockResolvedValue(true);
    });

    it('renders correctly', async () => {
        await act(async () => {
            render(
                <SettingsView
                    currentProvider="vercel"
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
        (Storage.getExaEnabled as jest.Mock).mockResolvedValue(false);
        await act(async () => {
            render(
                <SettingsView
                    currentProvider="vercel"
                    onClose={mockOnClose}
                    onProviderChange={mockOnProviderChange}
                    language="en"
                    onLanguageChange={mockOnLanguageChange}
                />
            );
        });

        const input = screen.getByPlaceholderText('vercelApiKeyPlaceholder');
        fireEvent.change(input, { target: { value: 'new-key' } });
        
        const saveBtn = screen.getByText('saveKey');
        await act(async () => {
            fireEvent.click(saveBtn);
        });

        // Check if browser.storage.local.set was called with correct key
        expect(browser.storage.local.set).toHaveBeenCalledWith(
            expect.objectContaining({ vercel_api_key: 'new-key' })
        );
        expect(Storage.saveExaApiKey).toHaveBeenCalledWith('exa-initial');
        expect(Storage.saveExaEnabled).toHaveBeenCalledWith(false); 
        expect(mockOnClose).toHaveBeenCalled();
    });

    it('updates Exa API key and saves', async () => {
        (Storage.getExaEnabled as jest.Mock).mockResolvedValue(true);
        await act(async () => {
            render(
                <SettingsView
                    currentProvider="vercel"
                    onClose={mockOnClose}
                    onProviderChange={mockOnProviderChange}
                    language="en"
                    onLanguageChange={mockOnLanguageChange}
                />
            );
        });

        // Now Exa Enabled is mocked as true, so input should be visible
        // However, in mock Switch, we might not have handled controlled state correctly?
        // Wait, mocked switch just uses input checkbox. 
        // With getExaEnabled true, exaEnabled state is true.
        // Switch checked=true.
        // Input should be rendered.

        // Actually the placeholder changed to 'exaApiKeyPlaceholder' (mocked as 'exaApiKeyPlaceholder' by t(k)=k)
        const exaInput = screen.getByPlaceholderText('exaApiKeyPlaceholder');
        fireEvent.change(exaInput, { target: { value: 'exa-new-key' } });
        
        const saveBtn = screen.getByText('saveKey');
        await act(async () => {
            fireEvent.click(saveBtn);
        });

        expect(Storage.saveExaApiKey).toHaveBeenCalledWith('exa-new-key');
        expect(Storage.saveExaEnabled).toHaveBeenCalledWith(true);
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

        expect(screen.getByTitle('refreshModels')).toBeInTheDocument();
        
        // Mock getModels to work
        const refreshBtn = screen.getByTitle('refreshModels');
        await act(async () => {
            fireEvent.click(refreshBtn);
        });

        // Should populate models
        expect(screen.getByText(/model1/)).toBeInTheDocument();
    });
});
