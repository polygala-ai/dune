// Renderer test environment setup.

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

/** Resize observer mock. */
class ResizeObserverMock {
  /** Observes resize observer mock. */
  observe() {
    // No-op for jsdom tests.
  }

  /** Unobserves resize observer mock. */
  unobserve() {
    // No-op for jsdom tests.
  }

  /** Disconnects resize observer mock. */
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
    getWorkflowSnapshot: vi.fn(() => Promise.resolve(null)),
    listProjectArtifactEntries: vi.fn(() => Promise.resolve([])),
    loadCodingEngineSettings: vi.fn(() => Promise.resolve({
      backendModel: '',
      backendType: 'claudeCode' as const,
      enabledEngineIds: ['claude-code', 'codex'] as Array<'claude-code' | 'codex'>,
    })),
    loadModelProviders: vi.fn(() => Promise.resolve([])),
    loadNetworkSettings: vi.fn(() => Promise.resolve({
      bypassRules: [],
      manualProxyUrl: '',
      mode: 'system' as const,
    })),
    openExternal: vi.fn(() => Promise.resolve(undefined)),
    openPath: vi.fn(() => Promise.resolve(undefined)),
    platform: 'darwin',
    prepareProjectRootPath: vi.fn((rootPath: string) => Promise.resolve(rootPath)),
    reloadExternalChannels: vi.fn(() => Promise.resolve(undefined)),
    restartApp: vi.fn(() => Promise.resolve(undefined)),
    saveCodingEngineSettings: vi.fn((settings) => Promise.resolve(settings)),
    saveModelProviders: vi.fn((providers) => Promise.resolve(providers)),
    saveNetworkSettings: vi.fn((settings) => Promise.resolve(settings)),
    saveWorkflowSnapshot: vi.fn(() => Promise.resolve(undefined)),
    selectProjectDirectory: vi.fn(() => Promise.resolve('/tmp/project-root')),
    startTelegramSetupSession: vi.fn(() => Promise.resolve('telegram-session-test')),
    deleteModelProviderSecret: vi.fn(() => Promise.resolve(undefined)),
    readModelProviderSecret: vi.fn(() => Promise.resolve('')),
    writeModelProviderSecret: vi.fn(() => Promise.resolve(undefined)),
  };
  document.documentElement.dataset.theme = 'light';
});

afterEach(() => {
  cleanup();
  listeners.clear();
});
