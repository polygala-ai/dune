// Workflow coordinator tests.

import { describe, expect, it, vi } from 'vitest';

import type { WorkflowSnapshotStore } from '@/electron/main/persistence/workflow-repository';
import { createWorkflowCoordinator } from '@/electron/main/workflow/workflow-coordinator';
import {
  MAX_LIVE_WORKFLOW_ITEM_ACTIVITY_EVENTS,
  createPersistedWorkflowItemActivityArchive,
  createWorkflowItemActivitySummary,
  type PersistedWorkflowItemActivityArchive,
} from '@/shared/workflow/activity';

/** Flushes pending microtasks. */
async function flushMicrotasks() {
  for (let index = 0; index < 8; index += 1) {
    await Promise.resolve();
  }
  await new Promise((resolve) => setTimeout(resolve, 0));
}

/** Retries an assertion until it passes or the attempts are exhausted. */
async function waitForAssertion(assertion: () => void, attempts = 10) {
  let lastError: unknown;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
      await flushMicrotasks();
    }
  }

  throw lastError;
}

/** Creates an in-memory app storage implementation. */
function createMemoryStore(initial: Record<string, unknown> = {}) {
  const values = new Map<string, unknown>(Object.entries(initial));
  const archives = new Map<string, PersistedWorkflowItemActivityArchive>();
  const store: WorkflowSnapshotStore = {
    deleteActivityArchive: async (itemId) => {
      archives.delete(itemId);
    },
    deleteActivityArchivesExcept: async (activeItemIds) => {
      for (const itemId of archives.keys()) {
        if (!activeItemIds.has(itemId)) {
          archives.delete(itemId);
        }
      }
    },
    readActivityArchive: async (itemId) =>
      archives.get(itemId) ?? createPersistedWorkflowItemActivityArchive(),
    readSnapshot: async () => (values.get('snapshot') as any) ?? null,
    writeActivityArchive: async (itemId, archive) => {
      archives.set(itemId, archive);
    },
    writeSnapshot: async (value) => {
      values.set('snapshot', value);
    },
  };

  return { archives, store, values };
}

/** Creates a stored workflow event. */
function createStoredEvent(id: string, createdAt: number) {
  return {
    createdAt,
    description: `event ${id}`,
    id,
    kind: 'item',
  };
}

/** Creates a workflow item fixture. */
function createItem(overrides: Record<string, unknown> = {}) {
  return {
    activity: createWorkflowItemActivitySummary(),
    createdAt: 0,
    id: 'item-1',
    primaryAgentId: 'agent-1',
    projectId: 'project-1',
    scheduledTaskId: null,
    sortOrder: 0,
    status: 'ready',
    tasks: [],
    title: 'Review backlog',
    updatedAt: 0,
    workProducts: [],
    workflowEvents: [],
    ...overrides,
  };
}

/** Creates a workflow snapshot fixture. */
function createSnapshot(itemOverrides: Record<string, unknown> = {}) {
  return {
    items: [createItem(itemOverrides)],
    projects: [{ id: 'project-1' }],
  };
}

describe('createWorkflowCoordinator', () => {
  it('compacts overflow workflow activity into the archive store', async () => {
    const { archives, store, values } = createMemoryStore();
    const coordinator = createWorkflowCoordinator({
      getRuntimeController: () => null,
      notifyWorkflowChanged: vi.fn(),
      workflowStore: store,
    });
    const workflowEvents = Array.from(
      { length: MAX_LIVE_WORKFLOW_ITEM_ACTIVITY_EVENTS + 2 },
      (_value, index) => createStoredEvent(`event-${index}`, index + 1),
    );

    await coordinator.workflowStore.writeSnapshot(createSnapshot({ workflowEvents }) as any);

    const storedSnapshot = values.get('snapshot') as any;
    const storedArchive = archives.get('item-1') as any;

    expect(storedSnapshot.items[0].workflowEvents).toHaveLength(MAX_LIVE_WORKFLOW_ITEM_ACTIVITY_EVENTS);
    expect(storedSnapshot.items[0].activity).toEqual(expect.objectContaining({
      archivedEventCount: 2,
      hasOlderEvents: true,
      totalEventCount: MAX_LIVE_WORKFLOW_ITEM_ACTIVITY_EVENTS + 2,
    }));
    expect(storedArchive.events).toHaveLength(2);
  });

  it('preserves the main-process scheduled task id for unchanged assignments', async () => {
    const previousSnapshot = createSnapshot({
      scheduledTaskId: 'task-prev',
    }) as any;
    const { store, values } = createMemoryStore({
      snapshot: previousSnapshot,
    });
    const runtimeController = {
      cancelItemAssignment: vi.fn(),
      getSnapshot: vi.fn(() => ({ agents: [], telegramSetupSessions: [] })),
      isItemTaskKnown: vi.fn(),
      scheduleItemAssignment: vi.fn(),
    };
    const coordinator = createWorkflowCoordinator({
      getRuntimeController: () => runtimeController as any,
      notifyWorkflowChanged: vi.fn(),
      workflowStore: store,
    });

    await coordinator.workflowStore.writeSnapshot(createSnapshot() as any);

    expect((values.get('snapshot') as any).items[0].scheduledTaskId).toBe('task-prev');
    expect(runtimeController.cancelItemAssignment).not.toHaveBeenCalled();
    expect(runtimeController.scheduleItemAssignment).not.toHaveBeenCalled();
  });

  it('recreates missing assignment tasks during the periodic sweep', async () => {
    const notifyWorkflowChanged = vi.fn();
    const scheduleItemAssignment = vi.fn(async () => 'task-recreated');
    const { store, values } = createMemoryStore({
      snapshot: createSnapshot() as any,
    });
    const coordinator = createWorkflowCoordinator({
      getRuntimeController: () => ({
        cancelItemAssignment: vi.fn(),
        getSnapshot: vi.fn(() => ({ agents: [], telegramSetupSessions: [] })),
        isItemTaskKnown: vi.fn(() => false),
        scheduleItemAssignment,
      }) as any,
      notifyWorkflowChanged,
      workflowStore: store,
    });

    coordinator.start();
    await flushMicrotasks();
    coordinator.stop();

    expect(scheduleItemAssignment).toHaveBeenCalledWith('agent-1', 'item-1');
    expect((values.get('snapshot') as any).items[0].scheduledTaskId).toBe('task-recreated');
    await waitForAssertion(() => {
      expect(notifyWorkflowChanged).toHaveBeenCalledTimes(1);
    });
  });

  it('does not recreate assignment tasks for review items during the periodic sweep', async () => {
    const notifyWorkflowChanged = vi.fn();
    const scheduleItemAssignment = vi.fn(async () => 'task-recreated');
    const { store, values } = createMemoryStore({
      snapshot: createSnapshot({
        scheduledTaskId: 'task-completed',
        status: 'review',
      }) as any,
    });
    const coordinator = createWorkflowCoordinator({
      getRuntimeController: () => ({
        cancelItemAssignment: vi.fn(),
        getSnapshot: vi.fn(() => ({ agents: [], telegramSetupSessions: [] })),
        isItemTaskKnown: vi.fn(() => false),
        scheduleItemAssignment,
      }) as any,
      notifyWorkflowChanged,
      workflowStore: store,
    });

    coordinator.start();
    await flushMicrotasks();
    coordinator.stop();

    expect(scheduleItemAssignment).not.toHaveBeenCalled();
    expect((values.get('snapshot') as any).items[0].scheduledTaskId).toBe('task-completed');
    expect(notifyWorkflowChanged).not.toHaveBeenCalled();
  });

  it('creates one auto-review nudge and does not duplicate it while pending', async () => {
    const { store, values } = createMemoryStore({
      snapshot: {
        items: [
          createItem({
            scheduledTaskId: 'task-existing',
            status: 'review',
          }),
        ],
        projects: [{ id: 'project-1' }],
      } as any,
    });
    const coordinator = createWorkflowCoordinator({
      getRuntimeController: () => ({
        cancelItemAssignment: vi.fn(),
        getSnapshot: vi.fn(() => ({
          agents: [{
            definition: { archetype: 'project-main' },
            id: 'agent-1',
            projectId: 'project-1',
            status: 'ready',
          }],
          telegramSetupSessions: [],
        })),
        isItemTaskKnown: vi.fn(() => true),
        scheduleItemAssignment: vi.fn(async () => 'task-auto'),
      }) as any,
      notifyWorkflowChanged: vi.fn(),
      workflowStore: store,
    });

    coordinator.onAgentIdle();
    await flushMicrotasks();
    coordinator.onAgentIdle();
    await flushMicrotasks();

    const snapshot = values.get('snapshot') as any;
    const autoItems = snapshot.items.filter(
      (item: { title: string }) => item.title === '[Auto] Review progress and plan next steps',
    );

    expect(autoItems).toHaveLength(1);
  });
});
