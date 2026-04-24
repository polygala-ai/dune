import { describe, expect, it, vi } from 'vitest';

import { SlaMonitor } from '@/electron/main/sla/sla-monitor';
import { createWorkflowItemActivitySummary } from '@/shared/workflow/activity';
import type { AppStorage } from '@/electron/main/storage';
import type { WorkflowItem, WorkflowSnapshot } from '@/electron/main/agent-actions/handlers/snapshot';

function item(overrides: Partial<WorkflowItem> = {}): WorkflowItem {
  return {
    activity: createWorkflowItemActivitySummary(),
    artifactFolderName: 'item-1',
    brief: 'Brief',
    createdAt: 1,
    id: 'item-1',
    priority: 'medium',
    primaryAgentId: null,
    projectId: 'project-1',
    scheduledTaskId: null,
    sortOrder: 0,
    status: 'active',
    tasks: [],
    title: 'Item',
    updatedAt: 1,
    workProducts: [],
    workflowEvents: [],
    ...overrides,
  };
}

function snapshot(items: WorkflowItem[]): WorkflowSnapshot {
  return {
    items,
    projects: [
      {
        color: '#000',
        createdAt: 1,
        description: '',
        id: 'project-1',
        name: 'Project',
        rootPath: null,
        updatedAt: 1,
      },
    ],
    selectedItemId: null,
    selectedProjectFilter: 'all',
    selectedProjectId: 'project-1',
    selectedProjectView: 'board',
  };
}

function store(initial: WorkflowSnapshot): AppStorage & { value: WorkflowSnapshot } {
  const storage = {
    value: initial,
    delete: async () => undefined,
    get: async <T,>(key: string) => (key === 'snapshot' ? initial as T : null),
    keys: async () => [],
    set: vi.fn(async (_key: string, value: unknown) => {
      initial = value as WorkflowSnapshot;
      storage.value = initial;
    }),
  };

  return storage;
}

describe('SlaMonitor', () => {
  it('warns within two hours and does not duplicate warnings', async () => {
    const workflowStore = store(snapshot([item({ slaDeadlineMs: 2 * 60 * 60 * 1000 })]));
    const notify = vi.fn();
    const monitor = new SlaMonitor({
      notificationManager: { notify },
      now: () => 1_000,
      onWorkflowChanged: vi.fn(),
      workflowStore,
    });

    await monitor.runOnce();
    await monitor.runOnce();

    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ trigger: 'sla_warning' }));
    expect((await workflowStore.get<WorkflowSnapshot>('snapshot'))?.items[0]?.slaWarnedAt).toBe(1_000);
  });

  it('breaches at the deadline and does not duplicate breaches', async () => {
    const workflowStore = store(snapshot([item({ slaDeadlineMs: 1_000 })]));
    const notify = vi.fn();
    const monitor = new SlaMonitor({
      notificationManager: { notify },
      now: () => 1_000,
      onWorkflowChanged: vi.fn(),
      workflowStore,
    });

    await monitor.runOnce();
    await monitor.runOnce();

    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ trigger: 'sla_breach' }));
    expect((await workflowStore.get<WorkflowSnapshot>('snapshot'))?.items[0]?.slaBreachedAt).toBe(1_000);
  });

  it('skips acceptance and done items', async () => {
    const workflowStore = store(snapshot([
      item({ id: 'done', slaDeadlineMs: 1_000, status: 'done' }),
      item({ id: 'acceptance', slaDeadlineMs: 1_000, status: 'acceptance' }),
    ]));
    const notify = vi.fn();
    const monitor = new SlaMonitor({
      notificationManager: { notify },
      now: () => 2_000,
      onWorkflowChanged: vi.fn(),
      workflowStore,
    });

    await monitor.runOnce();

    expect(notify).not.toHaveBeenCalled();
    expect(workflowStore.set).not.toHaveBeenCalled();
  });
});
