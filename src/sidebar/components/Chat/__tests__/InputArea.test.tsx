import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { InputArea } from '../InputArea';

describe('InputArea Component', () => {
    const mockOnSend = jest.fn();
    const mockOnScanPage = jest.fn();
    const mockOnSearchWeb = jest.fn();
    const mockOnGenerateImage = jest.fn();

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should render textarea and send button', () => {
        render(
            <InputArea
                onSend={mockOnSend}
                onScanPage={mockOnScanPage}
                onSearchWeb={mockOnSearchWeb}
                onGenerateImage={mockOnGenerateImage}
                language="en"
                exaEnabled={true}
                imageGenEnabled={false}
            />
        );

        expect(screen.getByPlaceholderText(/ask anything/i)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /send/i })).toBeInTheDocument();
    });

    it('should toggle search mode when search button is clicked', () => {
        render(
            <InputArea
                onSend={mockOnSend}
                onScanPage={mockOnScanPage}
                onSearchWeb={mockOnSearchWeb}
                onGenerateImage={mockOnGenerateImage}
                language="en"
                exaEnabled={true}
                imageGenEnabled={false}
            />
        );

        const searchButton = screen.getByTitle(/search web/i);
        
        // Should not show search input initially
        expect(screen.queryByPlaceholderText(/search query/i)).not.toBeInTheDocument();
        
        // Click to open search mode
        fireEvent.click(searchButton);
        
        // Should now show search input
        expect(screen.getByPlaceholderText(/search query/i)).toBeInTheDocument();
    });

    it('should submit search query when enter is pressed', () => {
        render(
            <InputArea
                onSend={mockOnSend}
                onScanPage={mockOnScanPage}
                onSearchWeb={mockOnSearchWeb}
                onGenerateImage={mockOnGenerateImage}
                language="en"
                exaEnabled={true}
                imageGenEnabled={false}
            />
        );

        const searchButton = screen.getByTitle(/search web/i);
        fireEvent.click(searchButton);

        const searchInput = screen.getByPlaceholderText(/search query/i);
        fireEvent.change(searchInput, { target: { value: 'test query' } });
        fireEvent.keyDown(searchInput, { key: 'Enter' });

        expect(mockOnSearchWeb).toHaveBeenCalledWith('test query');
    });

    it('should close search mode on escape key', () => {
        render(
            <InputArea
                onSend={mockOnSend}
                onScanPage={mockOnScanPage}
                onSearchWeb={mockOnSearchWeb}
                onGenerateImage={mockOnGenerateImage}
                language="en"
                exaEnabled={true}
                imageGenEnabled={false}
            />
        );

        const searchButton = screen.getByTitle(/search web/i);
        fireEvent.click(searchButton);

        const searchInput = screen.getByPlaceholderText(/search query/i);
        fireEvent.keyDown(searchInput, { key: 'Escape' });

        expect(screen.queryByPlaceholderText(/search query/i)).not.toBeInTheDocument();
    });

    it('should send message when send button is clicked', () => {
        render(
            <InputArea
                onSend={mockOnSend}
                onScanPage={mockOnScanPage}
                onSearchWeb={mockOnSearchWeb}
                onGenerateImage={mockOnGenerateImage}
                language="en"
                exaEnabled={true}
                imageGenEnabled={false}
            />
        );

        const textarea = screen.getByPlaceholderText(/ask anything/i);
        const sendButton = screen.getByRole('button', { name: /send/i });

        fireEvent.change(textarea, { target: { value: 'Hello AI' } });
        fireEvent.click(sendButton);

        expect(mockOnSend).toHaveBeenCalledWith('Hello AI');
    });
    it('should hide search button when exaEnabled is false', () => {
        render(
            <InputArea
                onSend={mockOnSend}
                onScanPage={mockOnScanPage}
                onSearchWeb={mockOnSearchWeb}
                onGenerateImage={mockOnGenerateImage}
                language="en"
                exaEnabled={false}
                imageGenEnabled={false}
            />
        );

        expect(screen.queryByTitle(/search web/i)).not.toBeInTheDocument();
    });
});
