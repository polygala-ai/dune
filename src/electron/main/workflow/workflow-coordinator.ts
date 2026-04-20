// Workflow persistence, activity compaction, and assignment coordination.

import type { DesktopRuntimeController } from '@/electron/main/runtime/desktop-runtime-controller';
import type { AppStorage } from '@/electron/main/storage';
import {
  createWorkflowEvent,
  recordWorkflowItemEvents,
} from '@/electron/main/agent-actions/handlers/snapshot';
import type {
  WorkflowEvent as StoredWorkflowEvent,
  WorkflowSnapshot as StoredWorkflowSnapshot,
} from '@/electron/main/agent-actions/handlers/snapshot';
import { isPlainObject } from '@/shared/is-record';
import {
  MAX_LIVE_WORKFLOW_ITEM_ACTIVITY_EVENTS,
  buildRollingWorkflowItemActivitySummary,
  clampWorkflowProjectActivityPageLimit,
  compareWorkflowProjectActivityEntries,
  createPersistedWorkflowItemActivityArchive,
  createWorkflowItemActivityArchiveKey,
  createWorkflowItemActivitySummary,
  createWorkflowProjectActivityEntry,
  getWorkflowItemActivityArchiveItemId,
} from '@/shared/workflow/activity';
import { shouldScheduleItemAssignmentTask } from '@/shared/workflow/item-assignment';

type WorkflowRuntimeController = Pick<
  DesktopRuntimeController,
  | 'cancelItemAssignment'
  | 'getSnapshot'
  | 'isItemTaskKnown'
  | 'scheduleItemAssignment'
>;

interface WorkflowCoordinatorOptions {
  clearInterval?: typeof globalThis.clearInterval;
  clearTimeout?: typeof globalThis.clearTimeout;
  getRuntimeController: () => WorkflowRuntimeController | null;
  notifyWorkflowChanged: () => void;
  setInterval?: typeof globalThis.setInterval;
  setTimeout?: typeof globalThis.setTimeout;
  workflowStore: AppStorage;
}

/** Creates workflow-specific storage and timer coordination. */
export function createWorkflowCoordinator(options: WorkflowCoordinatorOptions) {
  const clearIntervalFn = options.clearInterval ?? globalThis.clearInterval;
  const clearTimeoutFn = options.clearTimeout ?? globalThis.clearTimeout;
  const setIntervalFn = options.setInterval ?? globalThis.setInterval;
  const setTimeoutFn = options.setTimeout ?? globalThis.setTimeout;
  let nudgeIntervalHandle: ReturnType<typeof globalThis.setInterval> | null = null;
  let nudgeScheduled = false;
  let nudgeTimeoutHandle: ReturnType<typeof globalThis.setTimeout> | null = null;
  let started = false;
  let taskSweepIntervalHandle: ReturnType<typeof globalThis.setInterval> | null = null;

  function cloneStoredWorkflowEvent(event: StoredWorkflowEvent): StoredWorkflowEvent {
    return {
      ...(event.actor ? { actor: event.actor } : {}),
      createdAt: event.createdAt,
      description: event.description,
      id: event.id,
      kind: event.kind,
    };
  }

  function dedupeWorkflowEventsChronologically(
    events: StoredWorkflowEvent[],
  ): StoredWorkflowEvent[] {
    const seen = new Set<string>();
    const deduped: StoredWorkflowEvent[] = [];

    for (const event of events) {
      if (seen.has(event.id)) {
        continue;
      }

      seen.add(event.id);
      deduped.push(cloneStoredWorkflowEvent(event));
    }

    return deduped.sort((left, right) => {
      if (left.createdAt !== right.createdAt) {
        return left.createdAt - right.createdAt;
      }

      return left.id.localeCompare(right.id);
    });
  }

  function isWorkflowSnapshotLike(value: unknown): value is StoredWorkflowSnapshot {
    return isPlainObject(value) && Array.isArray(value.items) && Array.isArray(value.projects);
  }

  function recordDuneScheduledTaskEvent(
    snapshot: StoredWorkflowSnapshot,
    item: StoredWorkflowSnapshot['items'][number],
    description: string,
    createdAt: number,
  ) {
    recordWorkflowItemEvents(
      snapshot,
      item,
      [createWorkflowEvent('assignment', description, createdAt, 'Dune')],
      createdAt,
    );
  }

  async function compactWorkflowActivity(snapshot: StoredWorkflowSnapshot): Promise<void> {
    const activeItemIds = new Set(snapshot.items.map((item) => item.id));
    const workflowKeys = await options.workflowStore.keys();
    const staleArchiveKeys = workflowKeys.filter((key) => {
      const itemId = getWorkflowItemActivityArchiveItemId(key);
      return itemId !== null && !activeItemIds.has(itemId);
    });

    await Promise.all(staleArchiveKeys.map((key) => options.workflowStore.delete(key)));

    for (const item of snapshot.items) {
      const archiveKey = createWorkflowItemActivityArchiveKey(item.id);
      const existingArchive = createPersistedWorkflowItemActivityArchive(
        await options.workflowStore.get(archiveKey) ?? {},
      );
      const liveEvents = Array.isArray(item.workflowEvents)
        ? item.workflowEvents.map((event) => cloneStoredWorkflowEvent(event))
        : [];
      const liveWindow = liveEvents.slice(0, MAX_LIVE_WORKFLOW_ITEM_ACTIVITY_EVENTS);
      const overflow = liveEvents.slice(MAX_LIVE_WORKFLOW_ITEM_ACTIVITY_EVENTS).reverse();
      const archivedEvents = dedupeWorkflowEventsChronologically([
        ...existingArchive.events,
        ...overflow,
      ]);
      const rollingSummary = buildRollingWorkflowItemActivitySummary(item.title, archivedEvents);
      const totalEventCount = archivedEvents.length + liveWindow.length;

      item.activity = createWorkflowItemActivitySummary({
        archivedEventCount: archivedEvents.length,
        hasOlderEvents: archivedEvents.length > 0,
        rollingSummary,
        totalEventCount,
      });
      item.workflowEvents = liveWindow;

      if (archivedEvents.length === 0) {
        if (existingArchive.events.length > 0 || existingArchive.rollingSummary) {
          await options.workflowStore.delete(archiveKey);
        }
        continue;
      }

      await options.workflowStore.set(archiveKey, {
        events: archivedEvents,
        lastCompactedAt: Date.now(),
        rollingSummary,
      });
    }
  }

  async function getProjectActivityPage(
    projectId: string,
    optionsForPage?: { beforeEntryId?: string | null; limit?: number },
  ) {
    const snapshot = await options.workflowStore.get<StoredWorkflowSnapshot>('snapshot');

    if (!snapshot || !Array.isArray(snapshot.items)) {
      return {
        entries: [],
        hasOlderEntries: false,
        projectId,
        totalEntryCount: 0,
      };
    }

    const entries = new Map<string, ReturnType<typeof createWorkflowProjectActivityEntry>>();
    const projectItems = snapshot.items.filter((item) => item.projectId === projectId);

    for (const item of projectItems) {
      for (const event of item.workflowEvents) {
        entries.set(event.id, createWorkflowProjectActivityEntry(item, event));
      }

      const archive = createPersistedWorkflowItemActivityArchive(
        await options.workflowStore.get(createWorkflowItemActivityArchiveKey(item.id)) ?? {},
      );

      for (const event of archive.events) {
        entries.set(event.id, createWorkflowProjectActivityEntry(item, event));
      }
    }

    const sortedEntries = [...entries.values()].sort(compareWorkflowProjectActivityEntries);
    const limit = clampWorkflowProjectActivityPageLimit(optionsForPage?.limit);
    const beforeEntryIndex = optionsForPage?.beforeEntryId
      ? sortedEntries.findIndex((entry) => entry.id === optionsForPage.beforeEntryId)
      : -1;
    const startIndex = beforeEntryIndex >= 0 ? beforeEntryIndex + 1 : 0;
    const pageEntries = sortedEntries.slice(startIndex, startIndex + limit);

    return {
      entries: pageEntries,
      hasOlderEntries: startIndex + pageEntries.length < sortedEntries.length,
      projectId,
      totalEntryCount: sortedEntries.length,
    };
  }

  async function reconcileAssignments(previous: unknown, next: unknown): Promise<void> {
    const runtimeController = options.getRuntimeController();
    if (!runtimeController || !isWorkflowSnapshotLike(next)) {
      return;
    }

    const nextSnapshot = next;
    const nextItems = nextSnapshot.items;
    const prevItemsById = new Map<string, Record<string, unknown>>();

    if (isPlainObject(previous) && Array.isArray(previous.items)) {
      for (const item of previous.items) {
        if (isPlainObject(item) && typeof item.id === 'string') {
          prevItemsById.set(item.id, item);
        }
      }
    }

    const nextItemIds = new Set<string>();

    for (const item of nextItems) {
      if (!isPlainObject(item) || typeof item.id !== 'string') {
        continue;
      }

      nextItemIds.add(item.id);

      const prev = prevItemsById.get(item.id);
      const prevAgentId = prev && typeof prev.primaryAgentId === 'string' ? prev.primaryAgentId : null;
      const prevTaskId = prev && typeof prev.scheduledTaskId === 'string' ? prev.scheduledTaskId : null;
      const nextAgentId = typeof item.primaryAgentId === 'string' ? item.primaryAgentId : null;
      const nextStatus = typeof item.status === 'string' ? item.status : null;

      const agentChanged = prevAgentId !== nextAgentId;
      const shouldHaveTask = shouldScheduleItemAssignmentTask(nextStatus);

      if (!agentChanged && shouldHaveTask) {
        item.scheduledTaskId = prevTaskId;
        continue;
      }

      if (prevAgentId && prevTaskId) {
        await runtimeController.cancelItemAssignment(prevAgentId, prevTaskId).catch(() => {});
      }

      if (!shouldHaveTask || !nextAgentId) {
        item.scheduledTaskId = null;

        if (prevTaskId) {
          recordDuneScheduledTaskEvent(
            nextSnapshot,
            item,
            'Dune cleared the scheduled assignment task.',
            Date.now(),
          );
        }

        continue;
      }

      try {
        const taskId = await runtimeController.scheduleItemAssignment(nextAgentId, item.id);
        item.scheduledTaskId = taskId;

        if (taskId) {
          recordDuneScheduledTaskEvent(
            nextSnapshot,
            item,
            prevTaskId
              ? 'Dune rescheduled the assignment task for the assigned agent.'
              : 'Dune scheduled the assignment task for the assigned agent.',
            Date.now(),
          );
        }
      } catch {
        item.scheduledTaskId = null;
      }
    }

    for (const [id, prev] of prevItemsById) {
      if (nextItemIds.has(id)) {
        continue;
      }

      const prevAgentId = typeof prev.primaryAgentId === 'string' ? prev.primaryAgentId : null;
      const prevTaskId = typeof prev.scheduledTaskId === 'string' ? prev.scheduledTaskId : null;

      if (prevAgentId && prevTaskId) {
        await runtimeController.cancelItemAssignment(prevAgentId, prevTaskId).catch(() => {});
      }
    }
  }

  async function sweepItemAssignmentTasks(): Promise<void> {
    const runtimeController = options.getRuntimeController();
    if (!runtimeController) {
      return;
    }

    const snapshot = await options.workflowStore.get<StoredWorkflowSnapshot>('snapshot');
    if (!isWorkflowSnapshotLike(snapshot)) {
      return;
    }

    let dirty = false;

    for (const item of snapshot.items) {
      if (
        typeof item.id !== 'string'
        || typeof item.primaryAgentId !== 'string'
        || !shouldScheduleItemAssignmentTask(item.status)
      ) {
        continue;
      }

      const hasLiveTask = typeof item.scheduledTaskId === 'string'
        && runtimeController.isItemTaskKnown(item.primaryAgentId, item.scheduledTaskId);

      if (hasLiveTask) {
        continue;
      }

      try {
        const taskId = await runtimeController.scheduleItemAssignment(item.primaryAgentId, item.id);
        if (taskId) {
          item.scheduledTaskId = taskId;
          recordDuneScheduledTaskEvent(
            snapshot,
            item,
            'Dune recreated the missing assignment task for the assigned agent.',
            Date.now(),
          );
          dirty = true;
        }
      } catch {
        // Ignore — agent may not be ready; next sweep retries.
      }
    }

    if (dirty) {
      await compactWorkflowActivity(snapshot);
      await options.workflowStore.set('snapshot', snapshot);
      options.notifyWorkflowChanged();
    }
  }

  async function nudgeIdleMainAgents(store: AppStorage) {
    try {
      const workflow = await store.get<{
        agents: Array<{ id: string; projectId: string | null; role: string; status: string }>;
        items: Array<{
          id: string;
          primaryAgentId: string | null;
          projectId: string;
          status: string;
          tasks: Array<{ id: string; status: string; title: string }>;
          title: string;
        }>;
        projects: Array<{ id: string }>;
      }>('snapshot') as {
        agents?: Array<{ id: string; projectId: string | null; role: string; status: string }>;
        items: Array<{
          id: string;
          primaryAgentId: string | null;
          projectId: string;
          status: string;
          tasks: Array<{ id: string; status: string; title: string }>;
          title: string;
        }>;
        projects: Array<{ id: string }>;
      } | null;
      if (!workflow) {
        return;
      }

      const runtimeController = options.getRuntimeController();
      if (!runtimeController) {
        return;
      }

      const runtimeSnapshot = runtimeController.getSnapshot();

      for (const agent of runtimeSnapshot.agents) {
        if (
          agent.definition.archetype !== 'project-main'
          || agent.status !== 'ready'
          || !agent.projectId
        ) {
          continue;
        }

        const projectItems = workflow.items.filter((item) => item.projectId === agent.projectId);
        const hasInboxItems = projectItems.some((item) => item.status === 'inbox');
        const hasAnyItems = projectItems.length > 0;
        const nudgeTitlePrefix = '[Auto] Review progress and plan next steps';
        const hasPendingNudge = projectItems.some(
          (item) => item.title.startsWith('[Auto]') && item.status !== 'done',
        );

        if (hasAnyItems && !hasInboxItems && !hasPendingNudge) {
          const fullSnapshot = await store.get<Record<string, unknown>>('snapshot') as Record<string, unknown> | null;
          if (!fullSnapshot) {
            continue;
          }

          const now = Date.now();
          const activeCount = projectItems.filter((item) => item.status === 'active').length;
          const reviewCount = projectItems.filter((item) => item.status === 'review').length;
          const acceptanceCount = projectItems.filter((item) => item.status === 'acceptance').length;
          const doneCount = projectItems.filter((item) => item.status === 'done').length;

          const items = (fullSnapshot.items ?? []) as Array<Record<string, unknown>>;
          items.push({
            artifactFolderName: '',
            brief: [
              `Current board: ${activeCount} active, ${reviewCount} in review, ${acceptanceCount} in acceptance, ${doneCount} done, 0 in inbox.`,
              '',
              'Your job:',
              '1. Review items in review — reject with feedback if not ready, and move approved work into acceptance.',
              '2. Check active items — follow up on anything stalled.',
              '3. Identify gaps — what new work is needed based on project goals?',
              '4. Create new work items in inbox for anything missing.',
              '5. Move this item to review when finished. Approved review items should move to acceptance; only humans move items to done.',
            ].join('\n'),
            createdAt: now,
            id: `item-auto-${now}`,
            primaryAgentId: agent.id,
            projectId: agent.projectId,
            scheduledTaskId: null,
            sortOrder: 0,
            status: 'ready',
            tasks: [
              {
                createdAt: now,
                id: `task-${now}-1`,
                notes: '',
                status: 'todo',
                title: 'Review items in review lane — reject when needed and move approved work to acceptance',
                updatedAt: now,
              },
              {
                createdAt: now,
                id: `task-${now}-2`,
                notes: '',
                status: 'todo',
                title: 'Check active items for blockers or stalled progress',
                updatedAt: now,
              },
              {
                createdAt: now,
                id: `task-${now}-3`,
                notes: '',
                status: 'todo',
                title: 'Create new work items for what the project needs next',
                updatedAt: now,
              },
              {
                createdAt: now,
                id: `task-${now}-4`,
                notes: '',
                status: 'todo',
                title: 'Move this item to review when the pass is complete',
                updatedAt: now,
              },
            ],
            title: nudgeTitlePrefix,
            updatedAt: now,
            workProducts: [],
            workflowEvents: [{
              actor: 'Dune',
              createdAt: now,
              description: 'Auto-created: inbox was empty, time to review and plan.',
              id: `event-${now}`,
              kind: 'item',
            }],
          });

          fullSnapshot.items = items;
          await store.set('snapshot', fullSnapshot);
          options.notifyWorkflowChanged();
        }
      }
    } catch {
      // Ignore — runtime may not be ready yet.
    }
  }

  const workflowStore = {
    delete: async (key) => options.workflowStore.delete(key),
    get: async <T,>(key: string) => options.workflowStore.get<T>(key),
    keys: async () => options.workflowStore.keys(),
    set: async <T,>(key: string, value: T) => {
      if (key !== 'snapshot') {
        await options.workflowStore.set(key, value);
        return;
      }

      const previous = await options.workflowStore.get('snapshot');
      await reconcileAssignments(previous, value);
      if (isWorkflowSnapshotLike(value)) {
        await compactWorkflowActivity(value);
      }
      await options.workflowStore.set(key, value);
    },
  } satisfies AppStorage;

  function onWorkflowChanged() {
    options.notifyWorkflowChanged();
    if (nudgeScheduled) {
      return;
    }

    nudgeScheduled = true;
    nudgeTimeoutHandle = setTimeoutFn(() => {
      nudgeScheduled = false;
      nudgeTimeoutHandle = null;
      void nudgeIdleMainAgents(workflowStore);
    }, 10_000);
  }

  function onAgentIdle() {
    void nudgeIdleMainAgents(workflowStore);
  }

  function start() {
    if (started) {
      return;
    }

    started = true;
    nudgeIntervalHandle = setIntervalFn(() => {
      void nudgeIdleMainAgents(workflowStore);
    }, 60_000);
    taskSweepIntervalHandle = setIntervalFn(() => {
      void sweepItemAssignmentTasks();
    }, 120_000);
    void sweepItemAssignmentTasks();
  }

  function stop() {
    started = false;
    nudgeScheduled = false;

    if (nudgeTimeoutHandle) {
      clearTimeoutFn(nudgeTimeoutHandle);
      nudgeTimeoutHandle = null;
    }

    if (nudgeIntervalHandle) {
      clearIntervalFn(nudgeIntervalHandle);
      nudgeIntervalHandle = null;
    }

    if (taskSweepIntervalHandle) {
      clearIntervalFn(taskSweepIntervalHandle);
      taskSweepIntervalHandle = null;
    }
  }

  return {
    getProjectActivityPage,
    onAgentIdle,
    onWorkflowChanged,
    start,
    stop,
    workflowStore,
  };
}
