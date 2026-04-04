import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

const listeners = new Set<(event: MediaQueryListEvent) => void>();

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: (_event: string, listener: (event: MediaQueryListEvent) => void) => {
      listeners.add(listener);
    },
    removeEventListener: (
      _event: string,
      listener: (event: MediaQueryListEvent) => void,
    ) => {
      listeners.delete(listener);
    },
    addListener: vi.fn(),
    dispatchEvent: vi.fn(),
    removeListener: vi.fn(),
  })),
});

Object.defineProperty(window.HTMLElement.prototype, 'scrollTo', {
  configurable: true,
  value: vi.fn(),
});

Object.defineProperty(window.HTMLElement.prototype, 'scrollIntoView', {
  configurable: true,
  value: vi.fn(),
});

class ResizeObserverMock {
  observe() {
    // No-op for jsdom tests.
  }

  unobserve() {
    // No-op for jsdom tests.
  }

  disconnect() {
    // No-op for jsdom tests.
  }
}

Object.defineProperty(window, 'ResizeObserver', {
  configurable: true,
  writable: true,
  value: ResizeObserverMock,
});

beforeEach(() => {
  window.duneDesktop = {
    applyNetworkSettings: vi.fn(async () => undefined),
    copyText: vi.fn(async () => undefined),
    getRuntimeSnapshot: vi.fn(async () => ({
      agents: [],
      externalChannels: {
        telegram: {
        botUsername: null,
        configured: false,
        discoveredChats: [],
        errorMessage: null,
        status: 'not-configured' as const,
      },
    },
    isStreaming: false,
    runtimeInfo: {
      mode: 'real' as const,
      status: 'ready' as const,
    },
      selectedAgentId: null,
    })),
    openExternal: vi.fn(async () => undefined),
    platform: 'darwin',
    reloadExternalChannels: vi.fn(async () => undefined),
    restartApp: vi.fn(async () => undefined),
    storageDelete: vi.fn(async () => undefined),
    storageGet: vi.fn(async () => null),
    storageKeys: vi.fn(async () => []),
    storageSet: vi.fn(async () => undefined),
  };
  document.documentElement.dataset.theme = 'light';
});

afterEach(() => {
  cleanup();
  listeners.clear();
});
