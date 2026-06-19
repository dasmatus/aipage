import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { InputArea } from '../InputArea';

describe('InputArea Component', () => {
    const mockOnSend = jest.fn();
    const mockOnScanPage = jest.fn();
    const mockOnSearchWeb = jest.fn();
    const mockOnGenerateImage = jest.fn();

    const renderInput = (extra: Record<string, any> = {}) => render(
        <InputArea
            onSend={mockOnSend}
            onScanPage={mockOnScanPage}
            onSearchWeb={mockOnSearchWeb}
            onGenerateImage={mockOnGenerateImage}
            language="en"
            imageGenEnabled={false}
            {...extra}
        />
    );

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should render textarea and send button', () => {
        renderInput();
        expect(screen.getByPlaceholderText(/ask anything/i)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /send/i })).toBeInTheDocument();
    });

    it('should toggle search mode when search button is clicked', () => {
        renderInput();

        const searchButton = screen.getByTitle(/search web/i);

        // Should not show search input initially
        expect(screen.queryByPlaceholderText(/search query/i)).not.toBeInTheDocument();

        // Click to open search mode
        fireEvent.click(searchButton);

        // Should now show search input
        expect(screen.getByPlaceholderText(/search query/i)).toBeInTheDocument();
    });

    it('should submit search query when enter is pressed', () => {
        renderInput();

        const searchButton = screen.getByTitle(/search web/i);
        fireEvent.click(searchButton);

        const searchInput = screen.getByPlaceholderText(/search query/i);
        fireEvent.change(searchInput, { target: { value: 'test query' } });
        fireEvent.keyDown(searchInput, { key: 'Enter' });

        expect(mockOnSearchWeb).toHaveBeenCalledWith('test query');
    });

    it('should close search mode on escape key', () => {
        renderInput();

        const searchButton = screen.getByTitle(/search web/i);
        fireEvent.click(searchButton);

        const searchInput = screen.getByPlaceholderText(/search query/i);
        fireEvent.keyDown(searchInput, { key: 'Escape' });

        expect(screen.queryByPlaceholderText(/search query/i)).not.toBeInTheDocument();
    });

    it('should send message when send button is clicked', () => {
        renderInput();

        const textarea = screen.getByPlaceholderText(/ask anything/i);
        const sendButton = screen.getByRole('button', { name: /send/i });

        fireEvent.change(textarea, { target: { value: 'Hello AI' } });
        fireEvent.click(sendButton);

        expect(mockOnSend).toHaveBeenCalledWith('Hello AI');
    });

    it('should always show the web search button (Claude searches natively)', () => {
        renderInput();
        expect(screen.getByTitle(/search web/i)).toBeInTheDocument();
    });
});
