
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MessageList } from '../MessageList';
import { Message } from '../../../types';

// Mock marked to return predictable HTML
jest.mock('marked', () => ({
    marked: {
        setOptions: jest.fn(),
        parse: jest.fn((text) => `<p>${text}</p>`), // Simple synchronous mock
    },
}));

describe('MessageList', () => {
    const mockOnActionClick = jest.fn();
    const mockScrollIntoView = jest.fn();

    beforeAll(() => {
        // Mock scrollIntoView since it's not implemented in JSDOM
        Element.prototype.scrollIntoView = mockScrollIntoView;
    });

    beforeEach(() => {
        jest.clearAllMocks();
    });

    const mockMessages: Message[] = [
        {
            id: '1',
            role: 'user',
            content: 'Hello AI',
            timestamp: Date.now(),
        },
        {
            id: '2',
            role: 'ai',
            content: 'Hello User',
            timestamp: Date.now(),
            actions: [
                { label: 'Action 1', action: 'action1', primary: true },
                { label: 'Action 2', action: 'action2', primary: false },
            ],
        },
    ];

    it('renders messages correctly', async () => {
        render(<MessageList messages={mockMessages} userInitials="JD" language="en" />);

        expect(screen.getByText('JD')).toBeInTheDocument(); // User initials
        expect(screen.getByLabelText('AI')).toBeInTheDocument(); // AI avatar

        // Wait for async markdown rendering if any (our mock is sync but component wraps in Promise)
        await waitFor(() => {
            // Check content directly in the dangerous HTML
            // Note: our mock returns <p>text</p> but testing-library might see text content
            // However, the component renders strictly inside dangerouslySetInnerHTML.
            // screen.getByText might find it if JSDOM parses it.
             expect(document.body.innerHTML).toContain('Hello AI');
             expect(document.body.innerHTML).toContain('Hello User');
        });
    });

    it('renders action buttons and handles clicks', async () => {
        render(
            <MessageList 
                messages={mockMessages} 
                onActionClick={mockOnActionClick} 
                language="en"
            />
        );

        await waitFor(() => {
            expect(screen.getByText('Action 1')).toBeInTheDocument();
            expect(screen.getByText('Action 2')).toBeInTheDocument();
        });

        fireEvent.click(screen.getByText('Action 1'));
        expect(mockOnActionClick).toHaveBeenCalledWith('action1');

        fireEvent.click(screen.getByText('Action 2'));
        expect(mockOnActionClick).toHaveBeenCalledWith('action2');
    });

    it('disables actions when disableActions is true', async () => {
        render(
            <MessageList 
                messages={mockMessages} 
                onActionClick={mockOnActionClick}
                disableActions={true}
                language="en"
            />
        );

        await waitFor(() => {
             const btn1 = screen.getByText('Action 1') as HTMLButtonElement;
             expect(btn1).toBeDisabled();
        });
    });

    it('scrolls to bottom on new messages', () => {
        const { rerender } = render(<MessageList messages={[]} language="en" />);
        expect(mockScrollIntoView).toHaveBeenCalled(); // Initial render might trigger or not depending on refs but useEffect runs.

        mockScrollIntoView.mockClear();

        rerender(<MessageList messages={mockMessages} language="en" />);
        expect(mockScrollIntoView).toHaveBeenCalled();
    });
});
