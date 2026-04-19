// Assignment task orchestration tests.

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AppStorage } from '@/electron/main/storage';

vi.mock('fix-path', () => ({
  default: vi.fn(),
}));

vi.mock('electron-squirrel-startup', () => ({
  default: false,
}));

const mockApp = {
  commandLine: {
    appendSwitch: vi.fn(),
  },
  getAppPath: vi.fn(),
  getPath: vi.fn(),
  isPackaged: false,
  on: vi.fn(),
  quit: vi.fn(),
  relaunch: vi.fn(),
  whenReady: vi.fn(() => Promise.resolve(undefined)),
};

const mockBrowserWindow = {
  getAllWindows: vi.fn(() => []),
  getFocusedWindow: vi.fn(() => null),
};

vi.mock('electron', () => ({
  app: mockApp,
  BrowserWindow: mockBrowserWindow,
  clipboard: {
    writeText: vi.fn(),
  },
  dialog: {
    showOpenDialog: vi.fn(),
  },
  ipcMain: {
    handle: vi.fn(),
  },
  powerMonitor: {
    on: vi.fn(),
  },
  powerSaveBlocker: {
    start: vi.fn(),
    stop: vi.fn(),
  },
  session: {
    defaultSession: {
      clearCache: vi.fn(),
      clearStorageData: vi.fn(),
    },
  },
  shell: {
    openExternal: vi.fn(),
    openPath: vi.fn(),
  },
}));

if (!process.env.VITEST) {
  process.env.VITEST = 'true';
}

const { reconcileAssignments, sweepItemAssignmentTasks } = await import('@/electron/main');

describe('assignment task orchestration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBrowserWindow.getAllWindows.mockReturnValue([]);
  });

  it('status gating: does not schedule a wake-up for acceptance items', async () => {
    const scheduleItemAssignment = vi.fn(() => Promise.resolve('task-new'));
    const cancelItemAssignment = vi.fn(() => Promise.resolve(undefined));
    const next = {
      items: [{
        id: 'item-1',
        primaryAgentId: 'agent-1',
        scheduledTaskId: null,
        status: 'acceptance',
      }],
    };

    await reconcileAssignments(null, next, {
      cancelItemAssignment,
      scheduleItemAssignment,
    });

    expect(scheduleItemAssignment).not.toHaveBeenCalled();
    expect(cancelItemAssignment).not.toHaveBeenCalled();
    expect(next.items[0]?.scheduledTaskId).toBeNull();
  });

  it('becameActionable: schedules a wake-up on acceptance to active transition', async () => {
    const scheduleItemAssignment = vi.fn(() => Promise.resolve('task-new'));
    const cancelItemAssignment = vi.fn(() => Promise.resolve(undefined));
    const previous = {
      items: [{
        id: 'item-1',
        primaryAgentId: 'agent-1',
        scheduledTaskId: null,
        status: 'acceptance',
      }],
    };
    const next = {
      items: [{
        id: 'item-1',
        primaryAgentId: 'agent-1',
        scheduledTaskId: null,
        status: 'active',
      }],
    };

    await reconcileAssignments(previous, next, {
      cancelItemAssignment,
      scheduleItemAssignment,
    });

    expect(scheduleItemAssignment).toHaveBeenCalledTimes(1);
    expect(scheduleItemAssignment).toHaveBeenCalledWith('agent-1', 'item-1');
    expect(cancelItemAssignment).not.toHaveBeenCalled();
    expect(next.items[0]?.scheduledTaskId).toBe('task-new');
  });

  it('no-duplicate: preserves the existing task for already-active items', async () => {
    const scheduleItemAssignment = vi.fn(() => Promise.resolve('task-new'));
    const cancelItemAssignment = vi.fn(() => Promise.resolve(undefined));
    const previous = {
      items: [{
        id: 'item-1',
        primaryAgentId: 'agent-1',
        scheduledTaskId: 'task-existing',
        status: 'active',
      }],
    };
    const next = {
      items: [{
        id: 'item-1',
        primaryAgentId: 'agent-1',
        scheduledTaskId: null,
        status: 'active',
      }],
    };

    await reconcileAssignments(previous, next, {
      cancelItemAssignment,
      scheduleItemAssignment,
    });

    expect(scheduleItemAssignment).not.toHaveBeenCalled();
    expect(cancelItemAssignment).not.toHaveBeenCalled();
    expect(next.items[0]?.scheduledTaskId).toBe('task-existing');
  });

  it('sweepItemAssignmentTasks: skips acceptance items', async () => {
    const scheduleItemAssignment = vi.fn(() => Promise.resolve('task-new'));
    const isItemTaskKnown = vi.fn(() => false);
    const snapshot = {
      items: [{
        id: 'item-1',
        primaryAgentId: 'agent-1',
        scheduledTaskId: null,
        status: 'acceptance',
      }],
    };
    const getSnapshot = vi.fn(() => Promise.resolve(snapshot));
    const persistSnapshot = vi.fn((value: unknown) => Promise.resolve(value));
    const workflowStore: Pick<AppStorage, 'get' | 'set'> = {
      get: <T,>(key: string) => {
        void key;
        return getSnapshot() as Promise<T | null>;
      },
      set: <T,>(key: string, value: T) => {
        void key;
        return persistSnapshot(value).then(() => undefined);
      },
    };
    const emitWorkflowChanged = vi.fn();

    await sweepItemAssignmentTasks(
      {
        isItemTaskKnown,
        scheduleItemAssignment,
      },
      workflowStore,
      emitWorkflowChanged,
    );

    expect(scheduleItemAssignment).not.toHaveBeenCalled();
    expect(isItemTaskKnown).not.toHaveBeenCalled();
    expect(persistSnapshot).not.toHaveBeenCalled();
    expect(emitWorkflowChanged).not.toHaveBeenCalled();
  });
});
