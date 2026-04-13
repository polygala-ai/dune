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
    applyNetworkSettings: vi.fn(() => Promise.resolve(undefined)),
    cancelTelegramSetupSession: vi.fn(() => Promise.resolve(undefined)),
    copyText: vi.fn(() => Promise.resolve(undefined)),
    ensureProjectArtifactFolder: vi.fn(() => Promise.resolve('/tmp/project/item-123')),
    ensureProjectMainAgent: vi.fn(() => Promise.resolve('agent-project-main')),
    deleteLocalData: vi.fn(() => Promise.resolve(undefined)),
    getRuntimeSnapshot: vi.fn(() => Promise.resolve({
      agents: [],
      codingEngines: [],
      externalChannels: {},
      isStreaming: false,
      runtimeInfo: {
        mode: 'real' as const,
        status: 'ready' as const,
      },
      selectedAgentId: null,
      telegramSetupSessions: [],
    })),
    getTelegramSetupSession: vi.fn(() => Promise.resolve(null)),
    listProjectArtifactEntries: vi.fn(() => Promise.resolve([])),
    openExternal: vi.fn(() => Promise.resolve(undefined)),
    openPath: vi.fn(() => Promise.resolve(undefined)),
    platform: 'darwin',
    prepareProjectRootPath: vi.fn((rootPath: string) => Promise.resolve(rootPath)),
    reloadExternalChannels: vi.fn(() => Promise.resolve(undefined)),
    restartApp: vi.fn(() => Promise.resolve(undefined)),
    selectProjectDirectory: vi.fn(() => Promise.resolve('/tmp/project-root')),
    startTelegramSetupSession: vi.fn(() => Promise.resolve('telegram-session-test')),
    storageDelete: vi.fn(() => Promise.resolve(undefined)),
    storageGet: vi.fn(() => Promise.resolve(null)),
    storageKeys: vi.fn(() => Promise.resolve([])),
    storageSet: vi.fn(() => Promise.resolve(undefined)),
  };
  document.documentElement.dataset.theme = 'light';
});

afterEach(() => {
  cleanup();
  listeners.clear();
});
