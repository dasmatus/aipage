// Mock Chrome API globals to simulate browser extension environment
(globalThis as any).chrome = {
  runtime: {
    id: 'test-extension-id',
    sendMessage: () => Promise.resolve({ ok: true }),
    onMessage: {
      addListener: () => {},
      removeListener: () => {},
      hasListener: () => false,
    },
    getURL: (path: string) => `chrome-extension://test-id/${path}`,
    getManifest: () => ({ version: '1.0.0' }),
  },
  storage: {
    local: {
      get: () => Promise.resolve({}),
      set: () => Promise.resolve(),
      remove: () => Promise.resolve(),
      clear: () => Promise.resolve(),
    },
    sync: {
      get: () => Promise.resolve({}),
      set: () => Promise.resolve(),
      remove: () => Promise.resolve(),
      clear: () => Promise.resolve(),
    },
  },
  tabs: {
    query: () => Promise.resolve([]),
    sendMessage: () => Promise.resolve(),
    create: () => Promise.resolve(),
  },
};

import '@testing-library/jest-dom';
