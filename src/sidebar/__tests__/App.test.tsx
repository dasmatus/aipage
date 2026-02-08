
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
jest.mock('../i18n', () => ({
    t: (k: string) => k,
    getCurrentLanguage: jest.fn().mockResolvedValue('en'),
    setLanguage: jest.fn(),
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

describe('App', () => {
    const mockSendMessage = jest.fn();
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
            addMessage: mockAddMessage,
            updateLastMessage: mockUpdateLastMessage,
            setIsTyping: mockSetIsTyping,
            handlePageContext: mockHandlePageContext,
            generatePromptFromAction: mockGeneratePrompt,
            lastPageContext: '',
        });

        // Setup Storage mocks
        (Storage.getProviderPreference as jest.Mock).mockResolvedValue('vercel');
        (Storage.getApiKey as jest.Mock).mockResolvedValue('test-key');
        (Storage.getThemePreference as jest.Mock).mockResolvedValue('default');
    });

    it('renders chat view by default', async () => {
        await act(async () => {
             render(<App />);
        });
        const v = await Storage.getProviderPreference();
        // console.log('Mocked Provider:', v);
        
        expect(screen.getByTestId('message-list')).toBeInTheDocument();
        expect(screen.getByTestId('input-area')).toBeInTheDocument();
        const settingsView = screen.getByTestId('settings-view').parentElement;
        // In App.tsx, initial state is 'chat', so chat view is visible (translate-x-0) 
        // and settings view is hidden (translate-x-full).
        // Since we mock child components, we checks styles on container.
        // Actually, the test checks if it has class 'hidden'?
        // The implementation: view === 'settings' ? "translate-x-0 opacity-100" : "translate-x-full opacity-0 pointer-events-none hidden"
        // So yes, if view is chat, settings view has 'hidden'.
         expect(settingsView).toHaveClass('hidden');
    });

    it('switches to settings view', async () => {
        await act(async () => {
            render(<App />);
        });
        
        // Settings button has id settings-btn
        const settingsBtn = document.getElementById('settings-btn');
        if (settingsBtn) { 
            await act(async () => {
                fireEvent.click(settingsBtn);
            });
        }

        const settingsView = screen.getByTestId('settings-view').parentElement;
        expect(settingsView).not.toHaveClass('hidden');
    });

    it('sends message calls sendMessage', async () => {
        await act(async () => {
            render(<App />);
        });

        const sendBtn = screen.getByText('Send');
        await act(async () => {
            fireEvent.click(sendBtn);
        });

        await waitFor(() => {
             // App calls sendMessage with text, provider, key, options
             // default mock is 'vercel'
             expect(mockSendMessage).toHaveBeenCalledWith('hello', 'vercel', 'test-key', undefined);
        });
    });

    it('handles web search for local provider', async () => {
        // Change provider to ollama for web search test
        (Storage.getProviderPreference as jest.Mock).mockResolvedValue('ollama');
        (Storage.getLocalSettings as jest.Mock).mockResolvedValue({ url: 'http://localhost', model: 'llama2' });
        
        // Mock browser.runtime.sendMessage for search
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
            // Should also call sendMessage with search results prompt
            expect(mockSendMessage).toHaveBeenCalled(); 
        });
    });
});
