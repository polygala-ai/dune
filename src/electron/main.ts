// Electron main-process bootstrap and runtime wiring.

import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  powerMonitor,
  powerSaveBlocker,
  shell,
  session,
} from 'electron';
import fixPath from 'fix-path';
import os from 'node:os';
import path from 'node:path';
import started from 'electron-squirrel-startup';

// Packaged macOS .app bundles launched from Finder/Dock inherit the login
// PATH, which does not include user-local bins like ~/.local/bin or
// ~/.nvm/.../bin where `claude` / `codex` typically live. Rescue PATH from
// the user's shell before any binary detection runs.
if (app.isPackaged) {
  fixPath();
}

// Prevent GPU compositor crash / black screen on some macOS configurations.
app.commandLine.appendSwitch('--disable-gpu-sandbox');
app.commandLine.appendSwitch('--disable-software-rasterizer');

import { NetworkProxyManager } from '@/electron/main/network/network-proxy-manager';
import type { DesktopRuntimeController } from '@/electron/main/runtime/desktop-runtime-controller';
import type { AgentServiceSnapshot } from '@/shared/agents/agent-runtime';
import {
  getBootstrappedRuntimeSnapshot,
  pushCurrentRuntimeSnapshot,
} from '@/electron/main/runtime/runtime-snapshot';
import { resetLocalData } from '@/electron/main/reset-local-data';
import { resolveAgentLiteRuntimeRoot } from '@/electron/main/dune-paths';
import { EncryptedFileStorage, JsonFileStorage, type AppStorage } from '@/electron/main/storage';
import type {
  CreateAgentInput,
  StartTelegramSetupSessionInput,
} from '@/renderer/features/agents/types';
import { loadNetworkSettings } from '@/renderer/features/settings/model/network-settings';
import { ipcChannels } from '@/shared/electron/ipc-channels';
import { createDefaultTasks } from '@/shared/workflow/default-tasks';
import { createQuitCoordinator } from '@/electron/main/quit-coordinator';
import { isPlainObject } from '@/shared/is-record';
import type {
  WorkflowEvent as StoredWorkflowEvent,
  WorkflowSnapshot as StoredWorkflowSnapshot,
} from '@/electron/main/agent-actions/handlers/snapshot';
import {
  createWorkflowEvent,
  recordWorkflowItemEvents,
} from '@/electron/main/agent-actions/handlers/snapshot';
import {
  assertEmptyProjectRootDirectory,
  ensureProjectArtifactFolder,
  listProjectArtifactEntries,
  prepareProjectRootPath,
} from '@/electron/main/workflow/project-artifacts';
import { createMainWindowOptions } from '@/electron/main/window/create-main-window-options';
import {
  buildRollingWorkflowItemActivitySummary,
  clampWorkflowProjectActivityPageLimit,
  compareWorkflowProjectActivityEntries,
  createPersistedWorkflowItemActivityArchive,
  createWorkflowItemActivityArchiveKey,
  createWorkflowItemActivitySummary,
  createWorkflowProjectActivityEntry,
  getWorkflowItemActivityArchiveItemId,
  MAX_LIVE_WORKFLOW_ITEM_ACTIVITY_EVENTS,
} from '@/shared/workflow/activity';
import { shouldScheduleItemAssignmentTask } from '@/shared/workflow/item-assignment';
import { NotificationManager } from '@/electron/main/notifications/notification-manager';
import { MacOSNotifier } from '@/electron/main/notifications/macos-notifier';
import { TelegramNotifier } from '@/electron/main/notifications/telegram-notifier';
import type { NotificationSettingsPatch } from '@/electron/main/notifications/types';

if (started) {
  app.quit();
}

let mainWindow: BrowserWindow | null = null;
let networkProxyManager: NetworkProxyManager | null = null;
let runtimeController: DesktopRuntimeController | null = null;
let notificationManager: NotificationManager | null = null;
let nudgeScheduled = false;
let nudgeIntervalHandle: ReturnType<typeof setInterval> | null = null;
let taskSweepIntervalHandle: ReturnType<typeof setInterval> | null = null;
let powerBlockerId: number | null = null;
let telegramReconnectPromise: Promise<void> | null = null;
const NUDGE_INTERVAL_MS = 60_000;
const TASK_SWEEP_INTERVAL_MS = 120_000;

/** Returns whether Telegram polling or setup observers should stay alive. */
function hasActiveTelegramChannels(snapshot: AgentServiceSnapshot) {
  return snapshot.agents.some((agent) =>
    agent.channel.id === 'telegram' && agent.telegram?.status !== 'not-configured'
  ) || snapshot.telegramSetupSessions.length > 0;
}

/** Starts the App Nap blocker for Telegram long-polling on macOS. */
function startPowerBlocker() {
  if (process.platform !== 'darwin' || powerBlockerId !== null) {
    return;
  }

  powerBlockerId = powerSaveBlocker.start('prevent-app-suspension');
  console.info('Started the macOS App Nap blocker for Telegram polling.', {
    powerBlockerId,
  });
}

/** Stops the App Nap blocker when Telegram is no longer active. */
function stopPowerBlocker() {
  if (powerBlockerId === null) {
    return;
  }

  powerSaveBlocker.stop(powerBlockerId);
  console.info('Stopped the macOS App Nap blocker for Telegram polling.', {
    powerBlockerId,
  });
  powerBlockerId = null;
}

/** Keeps the App Nap blocker in sync with Telegram activity. */
function syncTelegramPowerBlocker(snapshot: AgentServiceSnapshot) {
  if (hasActiveTelegramChannels(snapshot)) {
    startPowerBlocker();
    return;
  }

  stopPowerBlocker();
}

/** Forces Telegram long-polling to reconnect after wake/unlock. */
async function reconnectTelegramChannels(reason: 'resume' | 'unlock-screen') {
  if (process.platform !== 'darwin') {
    return;
  }

  if (telegramReconnectPromise) {
    return telegramReconnectPromise;
  }

  telegramReconnectPromise = (async () => {
    const controller = runtimeController;

    if (!controller) {
      return;
    }

    const snapshot = controller.getSnapshot();

    if (!hasActiveTelegramChannels(snapshot)) {
      return;
    }

    console.info(`macOS ${reason} detected. Reconnecting Telegram polling.`);
    await controller.reloadExternalChannels();
  })()
    .catch((error) => {
      console.error(`Failed to reconnect Telegram polling after macOS ${reason}.`, error);
    })
    .finally(() => {
      telegramReconnectPromise = null;
    });

  return telegramReconnectPromise;
}

/** Nudges idle main agents. */
async function nudgeIdleMainAgents(
  _getController: () => DesktopRuntimeController,
  store: AppStorage,
) {
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
    if (!workflow) return;

    // Use the runtime snapshot for agent status (workflow store doesn't have live status)
    const controller = _getController();
    const runtimeSnapshot = controller.getSnapshot();

    for (const agent of runtimeSnapshot.agents) {
      if (agent.definition.archetype !== 'project-main' || agent.status !== 'ready' || !agent.projectId) continue;

      const projectItems = workflow.items.filter((item) => item.projectId === agent.projectId);
      const hasInboxItems = projectItems.some((item) => item.status === 'inbox');
      const hasAnyItems = projectItems.length > 0;
      const NUDGE_TITLE_PREFIX = '[Auto] Review progress and plan next steps';
      const hasPendingNudge = projectItems.some(
        (item) => item.title.startsWith('[Auto]') && item.status !== 'done',
      );

      // Only nudge if: kickoff is done, inbox is empty, no pending nudge, agent is idle
      if (hasAnyItems && !hasInboxItems && !hasPendingNudge) {
        const fullSnapshot = await store.get<Record<string, unknown>>('snapshot') as Record<string, unknown> | null;
        if (!fullSnapshot) continue;

        const now = Date.now();
        const activeCount = projectItems.filter((i) => i.status === 'active').length;
        const reviewCount = projectItems.filter((i) => i.status === 'review').length;
        const acceptanceCount = projectItems.filter((i) => i.status === 'acceptance').length;
        const doneCount = projectItems.filter((i) => i.status === 'done').length;

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
            { createdAt: now, id: `task-${now}-1`, notes: '', status: 'todo', title: 'Review items in review lane — reject when needed and move approved work to acceptance', updatedAt: now },
            { createdAt: now, id: `task-${now}-2`, notes: '', status: 'todo', title: 'Check active items for blockers or stalled progress', updatedAt: now },
            { createdAt: now, id: `task-${now}-3`, notes: '', status: 'todo', title: 'Create new work items for what the project needs next', updatedAt: now },
            { createdAt: now, id: `task-${now}-4`, notes: '', status: 'todo', title: 'Move this item to review when the pass is complete', updatedAt: now },
          ],
          title: NUDGE_TITLE_PREFIX,
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

        for (const window of BrowserWindow.getAllWindows()) {
          window.webContents.send(ipcChannels.workflowChanged);
        }
      }
    }

    // dispatchReadyAssignments handles signaling agents about their
    // ready, active, and review assignments automatically.
  } catch {
    // ignore — controller may not be ready
  }
}
const quitCoordinator = createQuitCoordinator({
  app,
  onShutdownError: (error) => {
    console.error('Failed to shutdown the Dune runtime cleanly before quit.', error);
  },
  shutdownRuntime: async () => {
    if (nudgeIntervalHandle) {
      clearInterval(nudgeIntervalHandle);
      nudgeIntervalHandle = null;
    }
    if (taskSweepIntervalHandle) {
      clearInterval(taskSweepIntervalHandle);
      taskSweepIntervalHandle = null;
    }
    notificationManager?.stop();
    stopPowerBlocker();
    await runtimeController?.shutdown();
  },
});

/** Returns runtime controller or throws. */
function requireRuntimeController() {
  if (!runtimeController) {
    throw new Error('Runtime controller is unavailable.');
  }

  return runtimeController;
}

/** Returns network proxy manager or throws. */
function requireNetworkProxyManager() {
  if (!networkProxyManager) {
    throw new Error('Network proxy manager is unavailable.');
  }

  return networkProxyManager;
}

/** Returns notification manager or throws. */
function requireNotificationManager() {
  if (!notificationManager) {
    throw new Error('Notification manager is unavailable.');
  }

  return notificationManager;
}

/** Creates window. */
const createWindow = () => {
  mainWindow = new BrowserWindow(
    createMainWindowOptions(process.platform, path.join(__dirname, 'preload.js')),
  );

  if (process.platform === 'darwin') {
    mainWindow.setWindowButtonVisibility(true);
  }

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    void mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL).catch((error) => {
      console.error('Failed to load the Dune renderer from the dev server.', error);
    });
  } else {
    void mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    ).catch((error) => {
      console.error('Failed to load the packaged Dune renderer.', error);
    });
  }

  mainWindow.webContents.on(
    'render-process-gone',
    (_event, details) => {
      console.error('The Dune renderer process exited unexpectedly.', details);
    },
  );
  mainWindow.webContents.on(
    'did-fail-load',
    (_event, errorCode, errorDescription, validatedUrl) => {
      console.error('The Dune renderer failed to load.', {
        errorCode,
        errorDescription,
        validatedUrl,
      });
    },
  );
  mainWindow.webContents.on('did-finish-load', () => {
    if (mainWindow) {
      pushCurrentRuntimeSnapshot(mainWindow, runtimeController);
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });
};

/** Creates initial runtime snapshot. */
function createInitialRuntimeSnapshot() {
  return {
    agents: [],
    codingEngines: [],
    externalChannels: {},
    isStreaming: false,
    runtimeInfo: {
      message: 'Starting Dune runtime.',
      mode: 'mock-fallback' as const,
      status: 'starting' as const,
    },
    selectedAgentId: null,
    telegramSetupSessions: [],
  };
}

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

function formatCurrency(value: number) {
  return `$${value.toFixed(value >= 10 ? 0 : 2).replace(/\.00$/, '')}`;
}

function describeAgentErrorContext(context: string) {
  switch (context) {
    case 'message-dispatch':
      return 'while dispatching a message';
    case 'runtime-restart':
      return 'while restarting';
    case 'runtime-rotate':
      return 'while rotating its compacted session';
    case 'runtime-start':
      return 'while starting';
    case 'scheduled-task':
      return 'while running a scheduled task';
    default:
      return 'during runtime work';
  }
}

async function notifyWorkflowStatusTransitions(previous: unknown, next: unknown) {
  if (!notificationManager || !isWorkflowSnapshotLike(previous) || !isWorkflowSnapshotLike(next)) {
    return;
  }

  const previousItemsById = new Map(previous.items.map((item) => [item.id, item]));

  for (const item of next.items) {
    const previousItem = previousItemsById.get(item.id);

    if (!previousItem || previousItem.status === item.status) {
      continue;
    }

    if (item.status === 'review') {
      await notificationManager.notify('item_review', {
        body: item.title,
        itemId: item.id,
        title: 'Work item moved to review',
      });
    }

    if (item.status === 'acceptance') {
      await notificationManager.notify('item_acceptance', {
        body: item.title,
        itemId: item.id,
        title: 'Work item moved to acceptance',
      });
    }
  }
}

void app.whenReady().then(async () => {
  const agentLiteHomeDir = process.env.DUNE_AGENTLITE_HOME_DIR;
  const duneHomeDir = agentLiteHomeDir ?? os.homedir();
  const agentLiteRuntimeRoot = resolveAgentLiteRuntimeRoot(agentLiteHomeDir);
  const userDataDir = app.getPath('userData');
  const stores = {
    agents: new JsonFileStorage(userDataDir, 'agents'),
    secrets: new EncryptedFileStorage(userDataDir, 'secrets'),
    settings: new JsonFileStorage(userDataDir, 'settings'),
    workflow: new JsonFileStorage(userDataDir, 'workflow'),
  };

  async function compactWorkflowActivity(snapshot: StoredWorkflowSnapshot): Promise<void> {
    const activeItemIds = new Set(snapshot.items.map((item) => item.id));
    const workflowKeys = await stores.workflow.keys();
    const staleArchiveKeys = workflowKeys.filter((key) => {
      const itemId = getWorkflowItemActivityArchiveItemId(key);
      return itemId !== null && !activeItemIds.has(itemId);
    });

    await Promise.all(staleArchiveKeys.map((key) => stores.workflow.delete(key)));

    for (const item of snapshot.items) {
      const archiveKey = createWorkflowItemActivityArchiveKey(item.id);
      const existingArchive = createPersistedWorkflowItemActivityArchive(
        await stores.workflow.get(archiveKey) ?? {},
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
          await stores.workflow.delete(archiveKey);
        }
        continue;
      }

      await stores.workflow.set(archiveKey, {
        events: archivedEvents,
        lastCompactedAt: Date.now(),
        rollingSummary,
      });
    }
  }

  async function getProjectActivityPage(
    projectId: string,
    options?: { beforeEntryId?: string | null; limit?: number },
  ) {
    const snapshot = await stores.workflow.get<StoredWorkflowSnapshot>('snapshot');

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
        await stores.workflow.get(createWorkflowItemActivityArchiveKey(item.id)) ?? {},
      );

      for (const event of archive.events) {
        entries.set(event.id, createWorkflowProjectActivityEntry(item, event));
      }
    }

    const sortedEntries = [...entries.values()].sort(compareWorkflowProjectActivityEntries);
    const limit = clampWorkflowProjectActivityPageLimit(options?.limit);
    const beforeEntryIndex = options?.beforeEntryId
      ? sortedEntries.findIndex((entry) => entry.id === options.beforeEntryId)
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
  /**
   * Diffs old vs new workflow snapshot for per-item assignment changes, and
   * calls scheduleItemAssignment / cancelItemAssignment on the runtime.
   * Mutates `next.items[*].scheduledTaskId` to reflect the outcome and records
   * Dune-driven scheduler changes in item activity.
   */
  async function reconcileAssignments(previous: unknown, next: unknown): Promise<void> {
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

    // Handle assignment changes and moves in or out of lanes that should keep a live assignment task.
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
        // scheduledTaskId is owned by the main process; the renderer only echoes
        // a stale copy. Always restore the authoritative value from the previous
        // stored snapshot so unrelated edits don't wipe it.
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

    // Cancel tasks for items that were deleted entirely.
    for (const [id, prev] of prevItemsById) {
      if (nextItemIds.has(id)) continue;

      const prevAgentId = typeof prev.primaryAgentId === 'string' ? prev.primaryAgentId : null;
      const prevTaskId = typeof prev.scheduledTaskId === 'string' ? prev.scheduledTaskId : null;

      if (prevAgentId && prevTaskId) {
        await runtimeController.cancelItemAssignment(prevAgentId, prevTaskId).catch(() => {});
      }
    }
  }

  /**
   * Periodic sweep: for every item assigned to an agent and still in a
   * lane that should keep an assignment task,
   * ensure the agentlite registry still has a task for it. If the stored
   * scheduledTaskId is null or no longer known to agentlite (e.g. after a
   * restart that lost the registry), schedule a fresh task and record it.
   */
  async function sweepItemAssignmentTasks(): Promise<void> {
    if (!runtimeController) return;

    const snapshot = await stores.workflow.get<StoredWorkflowSnapshot>('snapshot');

    if (!isWorkflowSnapshotLike(snapshot)) return;

    let dirty = false;

    for (const item of snapshot.items) {
      if (
        typeof item.id !== 'string' ||
        typeof item.primaryAgentId !== 'string' ||
        !shouldScheduleItemAssignmentTask(item.status)
      ) {
        continue;
      }

      const hasLiveTask = typeof item.scheduledTaskId === 'string'
        && runtimeController.isItemTaskKnown(item.primaryAgentId, item.scheduledTaskId);

      if (hasLiveTask) continue;

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
      // Write directly to the raw store to bypass reconcileAssignments (which
      // would overwrite the freshly-minted taskIds from the renderer's stale
      // echo). Compact activity first, then emit workflowChanged manually so
      // the renderer reloads.
      await compactWorkflowActivity(snapshot);
      await stores.workflow.set('snapshot', snapshot);
      for (const window of BrowserWindow.getAllWindows()) {
        window.webContents.send(ipcChannels.workflowChanged);
      }
    }
  }

  const workflowStore = {
    delete: async (key) => stores.workflow.delete(key),
    get: async <T,>(key: string) => stores.workflow.get<T>(key),
    keys: async () => stores.workflow.keys(),
    set: async <T,>(key: string, value: T) => {
      if (key !== 'snapshot') {
        await stores.workflow.set(key, value);
        return;
      }

      const previous = await stores.workflow.get('snapshot');
      await reconcileAssignments(previous, value);
      if (isWorkflowSnapshotLike(value)) {
        await compactWorkflowActivity(value);
      }
      await stores.workflow.set(key, value);
      await notifyWorkflowStatusTransitions(previous, value);
    },
  } satisfies AppStorage;

  notificationManager = new NotificationManager({
    getAgents: () => runtimeController?.getSnapshot().agents ?? [],
    macosNotifier: new MacOSNotifier(() => mainWindow),
    store: stores.settings,
    telegramNotifier: new TelegramNotifier(() => runtimeController?.getTelegramBridge() ?? null),
  });

  /** Resolves store. */
  function resolveStore(name: string): AppStorage {
    if (name === 'workflow') {
      return workflowStore;
    }

    const store = stores[name as keyof typeof stores];
    if (!store) throw new Error(`Unknown store: "${name}"`);
    return store;
  }

  let runtimeBootstrapScheduled = false;
  let runtimeBootstrapPromise: Promise<void> | null = null;
  networkProxyManager = new NetworkProxyManager({
    session: session.defaultSession,
  });

  /** Applies persisted network settings. */
  const applyPersistedNetworkSettings = async () => {
    const settings = await loadNetworkSettings(stores.settings);
    await requireNetworkProxyManager().apply(settings);
  };

  /** Ensures runtime. */
  const ensureRuntime = () => {
    if (runtimeBootstrapPromise) {
      return runtimeBootstrapPromise;
    }

    runtimeBootstrapPromise = Promise.all([
      import('@/electron/main/runtime/desktop-runtime-controller'),
      import('@/renderer/features/settings/model/model-providers'),
      import('@/renderer/features/settings/model/telegram-channel'),
    ]).then(async ([
      runtimeControllerModule,
      modelProvidersModule,
      _telegramChannelModule,
    ]) => {
      void _telegramChannelModule;
      const { DesktopRuntimeController } = runtimeControllerModule;
      const {
        loadModelProviders,
        resolveDefaultModelCredentials,
      } = modelProvidersModule;

      runtimeController = new DesktopRuntimeController({
        actionServices: {
          getRuntimeController: requireRuntimeController,
          onWorkflowChanged: () => {
            for (const window of BrowserWindow.getAllWindows()) {
              window.webContents.send(ipcChannels.workflowChanged);
            }
            if (!nudgeScheduled) {
              nudgeScheduled = true;
              setTimeout(() => {
                nudgeScheduled = false;
                void nudgeIdleMainAgents(requireRuntimeController, workflowStore);
              }, 10_000);
            }
          },
          workflowStore,
        },
        agentStore: stores.agents,
        bundledAgentDir: path.join(app.getAppPath(), 'agent'),
        ...(agentLiteHomeDir ? { homeDir: agentLiteHomeDir } : {}),
        onAgentError: ({ agentId, agentName, context, error }) => {
          void requireNotificationManager().notify('agent_error', {
            body: `${agentName} hit an error ${describeAgentErrorContext(context)}. ${error}`,
            itemId: agentId,
            title: 'Agent error',
          });
        },
        onAgentIdle: (_agentId) => {
          void nudgeIdleMainAgents(requireRuntimeController, workflowStore);
        },
        onBudgetWarning: ({ agentId, agentName, thresholdUsd, totalCostUsd }) => {
          void requireNotificationManager().notify('budget_warning', {
            body: `${agentName} crossed the ${formatCurrency(thresholdUsd)} warning threshold at ${formatCurrency(totalCostUsd)}.`,
            itemId: agentId,
            title: 'Budget warning',
          });
        },
        onItemActivityChanged: (payload) => {
          for (const window of BrowserWindow.getAllWindows()) {
            window.webContents.send(ipcChannels.itemActivityUpdated, payload);
          }
        },
        resolveProjectName: async (projectId) => {
          const snapshot = await stores.workflow.get<{
            projects?: Array<{ id: string; name: string; rootPath?: string | null }>;
          }>('snapshot');

          return snapshot?.projects?.find((project) => project.id === projectId)?.name ?? null;
        },
        resolveProjectRootPath: async (projectId) => {
          const snapshot = await stores.workflow.get<{
            projects?: Array<{ id: string; name: string; rootPath?: string | null }>;
          }>('snapshot');

          return snapshot?.projects?.find((project) => project.id === projectId)?.rootPath ?? null;
        },
        resolveModelCredentials: () => resolveDefaultModelCredentials({
          secretsStore: stores.secrets,
          settingsStore: stores.settings,
        }),
        telegramSecretsStore: stores.secrets,
      });

      runtimeController.subscribe((snapshot) => {
        syncTelegramPowerBlocker(snapshot);
        for (const window of BrowserWindow.getAllWindows()) {
          window.webContents.send(ipcChannels.runtimeSnapshotUpdated, snapshot);
        }
      });

      await loadModelProviders({
        secretsStore: stores.secrets,
        settingsStore: stores.settings,
      });
      await runtimeController.start();
      requireNotificationManager().startIdleCheck();

      // Periodic check: nudge idle project-main agents when inbox is empty
      nudgeIntervalHandle = setInterval(() => {
        void nudgeIdleMainAgents(requireRuntimeController, workflowStore);
      }, NUDGE_INTERVAL_MS);

      // Periodic sweep: ensure every assigned item has a live agentlite task.
      taskSweepIntervalHandle = setInterval(() => {
        void sweepItemAssignmentTasks();
      }, TASK_SWEEP_INTERVAL_MS);
      void sweepItemAssignmentTasks();
    }).catch((error) => {
      console.error('Failed to bootstrap the Dune runtime.', error);
      throw error;
    });

    return runtimeBootstrapPromise;
  };

  const scheduleRuntimeBootstrap = (delayMs: number) => {
    if (runtimeController || runtimeBootstrapScheduled) {
      return;
    }

    runtimeBootstrapScheduled = true;
    setTimeout(() => {
      void ensureRuntime();
    }, delayMs);
  };

  ipcMain.handle(ipcChannels.getRuntimeSnapshot, async () => {
    return getBootstrappedRuntimeSnapshot({
      createInitialRuntimeSnapshot,
      ensureRuntime,
      getRuntimeController: () => runtimeController,
    });
  });
  ipcMain.handle(
    ipcChannels.getAgentTranscriptPage,
    async (_event, agentId: string, options?: { beforeMessageId?: string | null; limit?: number }) => {
      await ensureRuntime();
      return requireRuntimeController().getTranscriptPage(agentId, options);
    },
  );
  ipcMain.handle(
    ipcChannels.getProjectActivityPage,
    async (_event, projectId: string, options?: { beforeEntryId?: string | null; limit?: number }) =>
      getProjectActivityPage(projectId, options),
  );
  ipcMain.handle(ipcChannels.applyNetworkSettings, async () => {
    await applyPersistedNetworkSettings();
    await ensureRuntime();
    await requireRuntimeController().reloadExternalChannels();
  });
  ipcMain.handle(ipcChannels.copyText, (_event, text: string) => {
    clipboard.writeText(text);
  });
  ipcMain.handle(ipcChannels.cancelTelegramSetupSession, async (_event, sessionId: string) => {
    await ensureRuntime();
    return requireRuntimeController().cancelTelegramSetupSession(sessionId);
  });
  ipcMain.handle(ipcChannels.openExternal, (_event, url: string) => shell.openExternal(url));
  ipcMain.handle(ipcChannels.openPath, async (_event, targetPath: string) => {
    const errorMessage = await shell.openPath(targetPath);

    if (errorMessage) {
      throw new Error(errorMessage);
    }
  });
  ipcMain.handle(ipcChannels.reloadExternalChannels, async () => {
    await ensureRuntime();
    return requireRuntimeController().reloadExternalChannels();
  });
  ipcMain.handle(ipcChannels.getTelegramSetupSession, async (_event, sessionId: string) => {
    await ensureRuntime();
    return requireRuntimeController().getTelegramSetupSession(sessionId);
  });
  ipcMain.handle(ipcChannels.createAgent, async (_event, input: CreateAgentInput) => {
    await ensureRuntime();
    return requireRuntimeController().createAgent(input);
  });
  ipcMain.handle(ipcChannels.deleteLocalData, async () => {
    await runtimeController?.shutdown();
    await Promise.allSettled([
      session.defaultSession.clearCache(),
      session.defaultSession.clearStorageData(),
    ]);
    await resetLocalData({
      agentLiteRuntimeRoot,
      userDataDir,
    });
    quitCoordinator.restart();
  });
  ipcMain.handle(ipcChannels.ensureProjectMainAgent, async (
    _event,
    projectId: string,
    projectName: string,
    projectRootPath?: string | null,
  ) => {
    await ensureRuntime();
    return requireRuntimeController().ensureProjectMainAgent(
      projectId,
      projectName,
      projectRootPath,
    );
  });
  ipcMain.handle(
    ipcChannels.ensureProjectArtifactFolder,
    async (_event, rootPath: string, artifactFolderName: string) =>
      ensureProjectArtifactFolder(rootPath, artifactFolderName),
  );
  ipcMain.handle(
    ipcChannels.prepareProjectRootPath,
    async (_event, rootPath: string, artifactFolderNames: string[]) =>
      prepareProjectRootPath(rootPath, artifactFolderNames),
  );
  ipcMain.handle(
    ipcChannels.listProjectArtifactEntries,
    async (_event, rootPath: string, artifactFolderName: string) =>
      listProjectArtifactEntries(rootPath, artifactFolderName),
  );
  ipcMain.handle(ipcChannels.selectProjectDirectory, async () => {
    const dialogTarget = mainWindow ?? BrowserWindow.getFocusedWindow() ?? undefined;
    const dialogOptions = {
      properties: ['openDirectory'],
      title: 'Choose an empty project folder',
    } satisfies Electron.OpenDialogOptions;
    const result = dialogTarget
      ? await dialog.showOpenDialog(dialogTarget, dialogOptions)
      : await dialog.showOpenDialog(dialogOptions);

    if (result.canceled) {
      return null;
    }

    const selectedPath = result.filePaths[0];

    if (!selectedPath) {
      return null;
    }

    return assertEmptyProjectRootDirectory(selectedPath);
  });
  ipcMain.handle(ipcChannels.deleteAgent, async (_event, agentId: string) => {
    await ensureRuntime();
    return requireRuntimeController().deleteAgent(agentId);
  });
  ipcMain.handle(ipcChannels.selectAgent, async (_event, agentId: string) => {
    await ensureRuntime();
    requireRuntimeController().selectAgent(agentId);
  });
  ipcMain.handle(ipcChannels.updateAgentChannel, async (_event, input) => {
    await ensureRuntime();
    return requireRuntimeController().updateAgentChannel(input);
  });
  ipcMain.handle(
    ipcChannels.updateAgentDefinition,
    async (_event, agentId: string, definition) => {
      await ensureRuntime();
      return requireRuntimeController().updateAgentDefinition(agentId, definition);
    },
  );
  ipcMain.handle(ipcChannels.sendAgentMessage, async (
    _event,
    agentId: string,
    text: string,
  ) => {
    await ensureRuntime();
    return requireRuntimeController().sendAgentMessage(agentId, text);
  });
  ipcMain.handle(ipcChannels.startTelegramSetupSession, async (
    _event,
    input: StartTelegramSetupSessionInput,
  ) => {
    await ensureRuntime();
    return requireRuntimeController().startTelegramSetupSession(input);
  });
  ipcMain.handle(ipcChannels.resetRuntime, async () => {
    await ensureRuntime();
    return requireRuntimeController().reset();
  });
  ipcMain.handle(ipcChannels.restartApp, () => {
    quitCoordinator.restart();
  });
  ipcMain.handle(
    ipcChannels.runIsolatedResearch,
    async (_event, agentId: string, input) => {
      await ensureRuntime();
      return requireRuntimeController().runIsolatedResearch(agentId, input);
    },
  );
  ipcMain.handle(ipcChannels.getNotificationSettings, async () =>
    requireNotificationManager().getSettings(),
  );
  ipcMain.handle(
    ipcChannels.updateNotificationSettings,
    async (_event, patch: NotificationSettingsPatch) =>
      requireNotificationManager().updateSettings(patch),
  );
  ipcMain.handle(ipcChannels.getNotificationHistory, async () =>
    requireNotificationManager().getHistory(),
  );
  ipcMain.handle(ipcChannels.clearNotificationHistory, async () =>
    requireNotificationManager().clearHistory(),
  );

  ipcMain.handle(ipcChannels.storageGet, async (_event, store: string, key: string) =>
    resolveStore(store).get(key),
  );
  ipcMain.handle(
    ipcChannels.storageSet,
    async (_event, store: string, key: string, value: unknown) =>
      resolveStore(store).set(key, value),
  );
  ipcMain.handle(ipcChannels.storageDelete, async (_event, store: string, key: string) =>
    resolveStore(store).delete(key),
  );
  ipcMain.handle(ipcChannels.storageKeys, async (_event, store: string) =>
    resolveStore(store).keys(),
  );

  await applyPersistedNetworkSettings();
  createWindow();
  scheduleRuntimeBootstrap(250);

  if (process.platform === 'darwin') {
    powerMonitor.on('suspend', () => {
      console.info('macOS suspend detected.');
    });
    powerMonitor.on('lock-screen', () => {
      console.info('macOS lock-screen detected.');
    });
    powerMonitor.on('resume', () => {
      void reconnectTelegramChannels('resume');
    });
    powerMonitor.on('unlock-screen', () => {
      void reconnectTelegramChannels('unlock-screen');
    });
  }

});

app.on('window-all-closed', () => {
  app.quit();
});

app.on('before-quit', (event) => {
  quitCoordinator.handleBeforeQuit(event);
});
