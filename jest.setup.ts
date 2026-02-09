const mockChrome = {
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

(global as any).chrome = mockChrome;
(globalThis as any).chrome = mockChrome;
if (typeof window !== 'undefined') {
    (window as any).chrome = mockChrome;
}

import '@testing-library/jest-dom';
import { TextEncoder, TextDecoder } from 'util';

global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder as any;

if (typeof global.TransformStream === 'undefined') {
    try {
        const { TransformStream } = require('stream/web');
        global.TransformStream = TransformStream;
    } catch (e) {
        // Fallback or ignore
    }
}
if (typeof global.ReadableStream === 'undefined') {
    try {
        const { ReadableStream } = require('stream/web');
        global.ReadableStream = ReadableStream;
    } catch (e) {}
}
