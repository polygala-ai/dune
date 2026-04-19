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
    clearNotificationHistory: vi.fn(() => Promise.resolve([])),
    copyText: vi.fn(() => Promise.resolve(undefined)),
    ensureProjectArtifactFolder: vi.fn(() => Promise.resolve('/tmp/project/item-123')),
    ensureProjectMainAgent: vi.fn(() => Promise.resolve('agent-project-main')),
    deleteLocalData: vi.fn(() => Promise.resolve(undefined)),
    getNotificationHistory: vi.fn(() => Promise.resolve([])),
    getNotificationSettings: vi.fn(() => Promise.resolve({
      channels: {
        macos: true,
        telegram: false,
      },
      doNotDisturb: {
        enabled: false,
        endHour: 8,
        startHour: 23,
      },
      telegramNotifyChatId: '',
      triggers: {
        agent_error: true,
        agent_idle: false,
        budget_warning: true,
        item_acceptance: true,
        item_review: true,
      },
    })),
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
    updateNotificationSettings: vi.fn((patch: {
      channels?: { macos?: boolean; telegram?: boolean };
      doNotDisturb?: { enabled?: boolean; endHour?: number; startHour?: number };
      telegramNotifyChatId?: string;
      triggers?: {
        agent_error?: boolean;
        agent_idle?: boolean;
        budget_warning?: boolean;
        item_acceptance?: boolean;
        item_review?: boolean;
      };
    }) => Promise.resolve({
      channels: {
        macos: patch.channels?.macos ?? true,
        telegram: patch.channels?.telegram ?? false,
      },
      doNotDisturb: {
        enabled: patch.doNotDisturb?.enabled ?? false,
        endHour: patch.doNotDisturb?.endHour ?? 8,
        startHour: patch.doNotDisturb?.startHour ?? 23,
      },
      telegramNotifyChatId: patch.telegramNotifyChatId ?? '',
      triggers: {
        agent_error: patch.triggers?.agent_error ?? true,
        agent_idle: patch.triggers?.agent_idle ?? false,
        budget_warning: patch.triggers?.budget_warning ?? true,
        item_acceptance: patch.triggers?.item_acceptance ?? true,
        item_review: patch.triggers?.item_review ?? true,
      },
    })),
  };
  document.documentElement.dataset.theme = 'light';
});

afterEach(() => {
  cleanup();
  listeners.clear();
});
