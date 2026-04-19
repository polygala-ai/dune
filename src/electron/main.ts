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
import {
  assertEmptyProjectRootDirectory,
  ensureProjectArtifactFolder,
  listProjectArtifactEntries,
  prepareProjectRootPath,
} from '@/electron/main/workflow/project-artifacts';
import { createMainWindowOptions } from '@/electron/main/window/create-main-window-options';

if (started) {
  app.quit();
}

let mainWindow: BrowserWindow | null = null;
let networkProxyManager: NetworkProxyManager | null = null;
let runtimeController: DesktopRuntimeController | null = null;
let nudgeScheduled = false;
let nudgeIntervalHandle: ReturnType<typeof setInterval> | null = null;
let taskSweepIntervalHandle: ReturnType<typeof setInterval> | null = null;
let powerBlockerId: number | null = null;
let telegramReconnectPromise: Promise<void> | null = null;
const NUDGE_INTERVAL_MS = 60_000;
const TASK_SWEEP_INTERVAL_MS = 120_000;

type AssignmentReconciliationRuntimeController = Pick<
  DesktopRuntimeController,
  'cancelItemAssignment' | 'scheduleItemAssignment'
>;

type AssignmentTaskSweepRuntimeController = Pick<
  DesktopRuntimeController,
  'isItemTaskKnown' | 'scheduleItemAssignment'
>;

/** Returns whether an item status should keep agent assignment tasks alive. */
export function isActionableStatus(status: string): boolean {
  return status === 'ready' || status === 'active' || status === 'review';
}

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
        const doneCount = projectItems.filter((i) => i.status === 'done').length;

        const items = (fullSnapshot.items ?? []) as Array<Record<string, unknown>>;
        items.push({
          artifactFolderName: '',
          brief: [
            `Current board: ${activeCount} active, ${reviewCount} in review, ${doneCount} done, 0 in inbox.`,
            '',
            'Your job:',
            '1. Review items in review — approve good ones, reject with feedback if not ready.',
            '2. Check active items — follow up on anything stalled.',
            '3. Identify gaps — what new work is needed based on project goals?',
            '4. Create new work items in inbox for anything missing.',
            '5. Move this item to done when finished.',
          ].join('\n'),
          createdAt: now,
          id: `item-auto-${now}`,
          primaryAgentId: agent.id,
          projectId: agent.projectId,
          scheduledTaskId: null,
          sortOrder: 0,
          status: 'ready',
          tasks: [
            { createdAt: now, id: `task-${now}-1`, notes: '', status: 'todo', title: 'Review items in review lane — approve or reject with feedback', updatedAt: now },
            { createdAt: now, id: `task-${now}-2`, notes: '', status: 'todo', title: 'Check active items for blockers or stalled progress', updatedAt: now },
            { createdAt: now, id: `task-${now}-3`, notes: '', status: 'todo', title: 'Create new work items for what the project needs next', updatedAt: now },
            { createdAt: now, id: `task-${now}-4`, notes: '', status: 'todo', title: 'Move this item to done', updatedAt: now },
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

/**
 * Diffs old vs new workflow snapshot for per-item assignment changes, and
 * calls scheduleItemAssignment / cancelItemAssignment on the runtime.
 * Mutates `next.items[*].scheduledTaskId` to reflect the outcome.
 */
export async function reconcileAssignments(
  previous: unknown,
  next: unknown,
  controller: AssignmentReconciliationRuntimeController | null,
): Promise<void> {
  if (!controller || !isPlainObject(next)) {
    return;
  }

  const nextItems = Array.isArray(next.items) ? next.items : [];
  const prevItemsById = new Map<string, Record<string, unknown>>();

  if (isPlainObject(previous) && Array.isArray(previous.items)) {
    for (const item of previous.items) {
      if (isPlainObject(item) && typeof item.id === 'string') {
        prevItemsById.set(item.id, item);
      }
    }
  }

  const nextItemIds = new Set<string>();

  // Handle assignment changes and moves-to-done on items that still exist.
  for (const item of nextItems) {
    if (!isPlainObject(item) || typeof item.id !== 'string') {
      continue;
    }

    nextItemIds.add(item.id);

    const prev = prevItemsById.get(item.id);
    const prevAgentId = prev && typeof prev.primaryAgentId === 'string' ? prev.primaryAgentId : null;
    const prevTaskId = prev && typeof prev.scheduledTaskId === 'string' ? prev.scheduledTaskId : null;
    const prevStatus = prev && typeof prev.status === 'string' ? prev.status : null;
    const nextAgentId = typeof item.primaryAgentId === 'string' ? item.primaryAgentId : null;
    const nextStatus = typeof item.status === 'string' ? item.status : null;

    const prevActionable = isActionableStatus(prevStatus ?? '');
    const nextActionable = isActionableStatus(nextStatus ?? '');
    const agentChanged = prevAgentId !== nextAgentId;
    const movedToDone = nextStatus === 'done' && prevStatus !== 'done';
    const becameActionable = !prevActionable && nextActionable && !!nextAgentId;
    const shouldSchedule = (agentChanged || becameActionable) && nextActionable;
    const lostActionable = prevActionable && !nextActionable;

    if (!agentChanged && !movedToDone && !becameActionable && !lostActionable) {
      // scheduledTaskId is owned by the main process; the renderer only echoes
      // a stale copy. Always restore the authoritative value from the previous
      // stored snapshot so unrelated edits don't wipe it.
      item.scheduledTaskId = prevTaskId;
      continue;
    }

    if (prevAgentId && prevTaskId) {
      await controller.cancelItemAssignment(prevAgentId, prevTaskId).catch(() => {});
    }

    if (movedToDone || !nextAgentId) {
      item.scheduledTaskId = null;
      continue;
    }

    if (!nextActionable) {
      item.scheduledTaskId = null;
      continue;
    }

    if (!shouldSchedule) {
      item.scheduledTaskId = prevTaskId;
      continue;
    }

    try {
      const taskId = await controller.scheduleItemAssignment(nextAgentId, item.id);
      item.scheduledTaskId = taskId;
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
      await controller.cancelItemAssignment(prevAgentId, prevTaskId).catch(() => {});
    }
  }
}

/**
 * Periodic sweep: for every actionable item assigned to an agent, ensure the
 * agentlite registry still has a task for it. If the stored scheduledTaskId is
 * null or no longer known to agentlite (e.g. after a restart that lost the
 * registry), schedule a fresh task.
 */
export async function sweepItemAssignmentTasks(
  controller: AssignmentTaskSweepRuntimeController | null,
  workflowStore: Pick<AppStorage, 'get' | 'set'>,
  emitWorkflowChanged: () => void,
): Promise<void> {
  if (!controller) {
    return;
  }

  const snapshot = await workflowStore.get<{
    items?: Array<{
      id?: string;
      primaryAgentId?: string | null;
      scheduledTaskId?: string | null;
      status?: string;
    }>;
  }>('snapshot');

  if (!snapshot || !Array.isArray(snapshot.items)) {
    return;
  }

  let dirty = false;

  for (const item of snapshot.items) {
    if (
      typeof item.id !== 'string' ||
      typeof item.primaryAgentId !== 'string' ||
      !isActionableStatus(typeof item.status === 'string' ? item.status : '')
    ) {
      continue;
    }

    const hasLiveTask = typeof item.scheduledTaskId === 'string'
      && controller.isItemTaskKnown(item.primaryAgentId, item.scheduledTaskId);

    if (hasLiveTask) continue;

    try {
      const taskId = await controller.scheduleItemAssignment(item.primaryAgentId, item.id);
      if (taskId) {
        item.scheduledTaskId = taskId;
        dirty = true;
      }
    } catch {
      // Ignore — agent may not be ready; next sweep retries.
    }
  }

  if (dirty) {
    // Write directly to the raw store to bypass reconcileAssignments (which
    // would overwrite the freshly-minted taskIds from the renderer's stale
    // echo). Emit workflowChanged manually so the renderer reloads.
    await workflowStore.set('snapshot', snapshot);
    emitWorkflowChanged();
  }
}

async function bootstrapMainProcess(): Promise<void> {
  await app.whenReady();

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
  const emitWorkflowChanged = () => {
    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.send(ipcChannels.workflowChanged);
    }
  };

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
      await reconcileAssignments(previous, value, runtimeController);
      await stores.workflow.set(key, value);
    },
  } satisfies AppStorage;

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
            emitWorkflowChanged();
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
        onAgentIdle: (_agentId) => {
          void nudgeIdleMainAgents(requireRuntimeController, workflowStore);
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

      // Periodic check: nudge idle project-main agents when inbox is empty
      nudgeIntervalHandle = setInterval(() => {
        void nudgeIdleMainAgents(requireRuntimeController, workflowStore);
      }, NUDGE_INTERVAL_MS);

      // Periodic sweep: ensure every assigned item has a live agentlite task.
      taskSweepIntervalHandle = setInterval(() => {
        void sweepItemAssignmentTasks(runtimeController, stores.workflow, emitWorkflowChanged);
      }, TASK_SWEEP_INTERVAL_MS);
      void sweepItemAssignmentTasks(runtimeController, stores.workflow, emitWorkflowChanged);
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
}

if (process.env.VITEST !== 'true') {
  void bootstrapMainProcess();
}

app.on('window-all-closed', () => {
  app.quit();
});

app.on('before-quit', (event) => {
  quitCoordinator.handleBeforeQuit(event);
});
