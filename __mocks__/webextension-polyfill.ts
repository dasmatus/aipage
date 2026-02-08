// Mock for webextension-polyfill
const browser = {
    runtime: {
        id: 'test-extension-id',
        sendMessage: jest.fn(() => Promise.resolve({ ok: true })),
        onMessage: {
            addListener: jest.fn(),
        },
    },
    storage: {
        local: {
            get: jest.fn(() => Promise.resolve({})),
            set: jest.fn(() => Promise.resolve()),
        },
    },
    tabs: {
        query: jest.fn(() => Promise.resolve([])),
    },
};

export default browser;
