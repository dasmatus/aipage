
import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import App from '../App';
import * as Storage from '../storage';
import { useChat } from '../hooks/useChat';
import browser from 'webextension-polyfill';

// Mock dependencies
jest.mock('webextension-polyfill');
jest.mock('../storage');
jest.mock('../hooks/useChat');

// Native web search lives on the anthropic provider; local providers have none.
const mockWebSearch = jest.fn().mockResolvedValue('AI answer');
jest.mock('../providers', () => ({
    getProvider: (type: string) =>
        type === 'anthropic' ? { webSearch: mockWebSearch } : { sendMessage: jest.fn() },
}));
// Avoid loading the Anthropic SDK / WASM ImageMagick in jsdom.
jest.mock('../providers/imagegen', () => ({
    generateImage: jest.fn(),
}));

jest.mock('../i18n', () => ({
    t: (k: string) => k,
    getCurrentLanguage: jest.fn().mockResolvedValue('en'),
    setLanguage: jest.fn(),
    LANGUAGE_NAMES: { en: 'English' },
}));

// Mock child components
jest.mock('../components/Chat/MessageList', () => ({
    MessageList: (props: any) => (
        <div data-testid="message-list">
            Messages: {props.messages.length}
            <button onClick={() => props.onActionClick('search_web')}>Click Action</button>
        </div>
    )
}));
jest.mock('../components/Chat/InputArea', () => ({
    InputArea: (props: any) => (
        <div data-testid="input-area">
            <button onClick={() => props.onSend('hello')}>Send</button>
            <button onClick={() => props.onSearchWeb('query')}>Search Web</button>
        </div>
    )
}));
jest.mock('../components/Settings/SettingsView', () => ({
    SettingsView: (props: any) => (
        <div data-testid="settings-view">
            <button onClick={props.onClose}>Close Settings</button>
        </div>
    )
}));
jest.mock('../components/Widgets/WidgetsView', () => ({
    WidgetsView: () => <div data-testid="widgets-view" />,
}));

describe('App', () => {
    const mockSendMessage = jest.fn();
    const mockSendAgentMessage = jest.fn();
    const mockAddMessage = jest.fn();
    const mockUpdateLastMessage = jest.fn();
    const mockSetIsTyping = jest.fn();
    const mockHandlePageContext = jest.fn();
    const mockGeneratePrompt = jest.fn();

    beforeEach(() => {
        jest.clearAllMocks();

        // Setup useChat mock
        (useChat as jest.Mock).mockReturnValue({
            messages: [],
            isTyping: false,
            sendMessage: mockSendMessage,
            sendAgentMessage: mockSendAgentMessage,
            addMessage: mockAddMessage,
            updateLastMessage: mockUpdateLastMessage,
            setIsTyping: mockSetIsTyping,
            handlePageContext: mockHandlePageContext,
            generatePromptFromAction: mockGeneratePrompt,
            lastPageContext: '',
        });

        // Setup Storage mocks
        (Storage.getProviderPreference as jest.Mock).mockResolvedValue('anthropic');
        (Storage.getApiKey as jest.Mock).mockResolvedValue('test-key');
        (Storage.getThemePreference as jest.Mock).mockResolvedValue('default');
        (Storage.getLocalSettings as jest.Mock).mockResolvedValue({ url: '', model: '' });
    });

    it('renders chat view by default', async () => {
        await act(async () => {
             render(<App />);
        });

        expect(screen.getByTestId('message-list')).toBeInTheDocument();
        expect(screen.getByTestId('input-area')).toBeInTheDocument();
        const settingsView = screen.getByTestId('settings-view').parentElement;
        // view === 'chat' by default, so the settings container is hidden.
        expect(settingsView).toHaveClass('hidden');
    });

    it('switches to settings view', async () => {
        await act(async () => {
            render(<App />);
        });

        const settingsBtn = document.getElementById('settings-btn');
        if (settingsBtn) {
            await act(async () => {
                fireEvent.click(settingsBtn);
            });
        }

        const settingsView = screen.getByTestId('settings-view').parentElement;
        expect(settingsView).not.toHaveClass('hidden');
    });

    it('sends message through the agent for Claude', async () => {
        await act(async () => {
            render(<App />);
        });

        const sendBtn = screen.getByText('Send');
        await act(async () => {
            fireEvent.click(sendBtn);
        });

        await waitFor(() => {
             // For the anthropic provider, the main chat runs as a Managed Agents turn.
             expect(mockSendAgentMessage).toHaveBeenCalledWith('hello', 'test-key', undefined);
        });
    });

    it('sends message directly for a local provider', async () => {
        (Storage.getProviderPreference as jest.Mock).mockResolvedValue('ollama');

        await act(async () => {
            render(<App />);
        });

        const sendBtn = screen.getByText('Send');
        await act(async () => {
            fireEvent.click(sendBtn);
        });

        await waitFor(() => {
             expect(mockSendMessage).toHaveBeenCalledWith('hello', 'ollama', 'test-key', { baseUrl: '', modelName: '' });
        });
    });

    it('handles web search for local provider via DuckDuckGo', async () => {
        // Local provider (no native web search) → DuckDuckGo fallback, then summarize.
        (Storage.getProviderPreference as jest.Mock).mockResolvedValue('ollama');
        (Storage.getLocalSettings as jest.Mock).mockResolvedValue({ url: 'http://localhost', model: 'llama2' });

        (browser.runtime.sendMessage as jest.Mock).mockResolvedValue({
            ok: true,
            results: [{ title: 'Res', snippet: 'Snip', url: 'http://example.com' }]
        });

        await act(async () => {
            render(<App />);
        });

        const searchBtn = screen.getByText('Search Web');
        fireEvent.click(searchBtn);

        await waitFor(() => {
            expect(browser.runtime.sendMessage).toHaveBeenCalledWith({
                action: 'search_web',
                payload: { query: 'query' }
            });
            // Should summarize the results with the model.
            expect(mockSendMessage).toHaveBeenCalled();
        });
    });

    it('handles web search for Claude via native web search', async () => {
        (Storage.getProviderPreference as jest.Mock).mockResolvedValue('anthropic');
        (Storage.getLocalSettings as jest.Mock).mockResolvedValue({ url: '', model: '' });

        await act(async () => {
            render(<App />);
        });

        const searchBtn = screen.getByText('Search Web');
        fireEvent.click(searchBtn);

        await waitFor(() => {
            // Claude searches and answers natively; no DuckDuckGo round-trip.
            expect(mockWebSearch).toHaveBeenCalledWith(
                'query',
                'test-key',
                expect.anything(),
                expect.any(Function)
            );
            expect(browser.runtime.sendMessage).not.toHaveBeenCalledWith(
                expect.objectContaining({ action: 'search_web' })
            );
        });
    });
});
