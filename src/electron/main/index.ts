import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
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

import { AgentIpcManager } from '@/electron/main/agent-ipc/agent-ipc-manager';
import { createToolHandler } from '@/electron/main/agent-ipc/tools-handler';
import { NetworkProxyManager } from '@/electron/main/network/network-proxy-manager';
import type { DesktopRuntimeController } from '@/electron/main/runtime/desktop-runtime-controller';
import {
  getBootstrappedRuntimeSnapshot,
  pushCurrentRuntimeSnapshot,
} from '@/electron/main/runtime/runtime-snapshot';
import { resetLocalData } from '@/electron/main/reset-local-data';
import { resolveAgentLiteRuntimeRoot } from '@/electron/runtime-core/agentlite-host';
import { EncryptedFileStorage, JsonFileStorage, type AppStorage } from '@/electron/main/storage';
import type {
  CreateAgentInput,
  StartTelegramSetupSessionInput,
} from '@/renderer/features/agents/types';
import { loadNetworkSettings } from '@/renderer/features/settings/model/network-settings';
import { ipcChannels } from '@/shared/electron/ipc-channels';
import { createDefaultTasks } from '@/shared/workflow/default-tasks';
import { createQuitCoordinator } from '@/electron/main/quit-coordinator';
import {
  normalizeReadyAssignmentsWorkflowSnapshot,
  syncReadyAssignmentInboxSnapshots,
  type ReadyAssignmentInboxState,
} from '@/electron/main/workflow/ready-assignment-inbox';
import {
  assertEmptyProjectRootDirectory,
  ensureProjectArtifactFolder,
  listProjectArtifactEntries,
  prepareProjectRootPath,
} from '@/electron/main/workflow/project-artifacts';
import { createMainWindowOptions } from './window/create-main-window-options';

if (started) {
  app.quit();
}

let mainWindow: BrowserWindow | null = null;
let networkProxyManager: NetworkProxyManager | null = null;
let runtimeController: DesktopRuntimeController | null = null;
let nudgeScheduled = false;
let nudgeIntervalHandle: ReturnType<typeof setInterval> | null = null;
const NUDGE_INTERVAL_MS = 60_000;

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
      if (agent.role !== 'project-main' || agent.status !== 'ready' || !agent.projectId) continue;

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

    // Active items are now included in the ready-assignment inbox snapshot.
    // The sync mechanism (syncReadyAssignmentInboxes) handles signaling
    // agents about their active assignments automatically.
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
    await runtimeController?.shutdown();
  },
});

function requireRuntimeController() {
  if (!runtimeController) {
    throw new Error('Runtime controller is unavailable.');
  }

  return runtimeController;
}

function requireNetworkProxyManager() {
  if (!networkProxyManager) {
    throw new Error('Network proxy manager is unavailable.');
  }

  return networkProxyManager;
}

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

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });
};

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
  let readyAssignmentInboxStates = new Map<string, ReadyAssignmentInboxState>();

  async function syncReadyAssignmentInboxes(snapshotValue: unknown) {
    const snapshot = normalizeReadyAssignmentsWorkflowSnapshot(snapshotValue)
      ?? { items: [], projects: [] };

    if (!runtimeController) {
      return;
    }

    const result = syncReadyAssignmentInboxSnapshots({
      agents: runtimeController.getSnapshot().agents,
      homeDir: duneHomeDir,
      snapshot,
      states: readyAssignmentInboxStates,
    });

    readyAssignmentInboxStates = result.states;

    await Promise.all(result.updates.map(async (update) => {
      if (!update.shouldWake && update.itemCount > 0) {
        return;
      }

      await runtimeController?.signalReadyAssignmentInbox(update.agentId, {
        generation: update.generation,
        itemCount: update.itemCount,
      });
    }));
  }

  const workflowStore = {
    delete: async (key) => stores.workflow.delete(key),
    get: async <T,>(key: string) => stores.workflow.get<T>(key),
    keys: async () => stores.workflow.keys(),
    set: async <T,>(key: string, value: T) => {
      await stores.workflow.set(key, value);

      if (key !== 'snapshot') {
        return;
      }

      await syncReadyAssignmentInboxes(value);
    },
  } satisfies AppStorage;

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

  const applyPersistedNetworkSettings = async () => {
    const settings = await loadNetworkSettings(stores.settings);
    await requireNetworkProxyManager().apply(settings);
  };

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
        migrateModelProviders,
        resolveDefaultModelCredentials,
      } = modelProvidersModule;

      const agentIpcManager = new AgentIpcManager(duneHomeDir);
      agentIpcManager.setToolMessageHandler(createToolHandler({
        getRuntimeController: requireRuntimeController,
        onWorkflowChanged: () => {
          for (const window of BrowserWindow.getAllWindows()) {
            window.webContents.send(ipcChannels.workflowChanged);
          }

          // Nudge idle project-main agents when their project inbox is empty.
          // Debounced to avoid infinite loops (agent creates item → change → nudge → ...).
          if (!nudgeScheduled) {
            nudgeScheduled = true;
            setTimeout(() => {
              nudgeScheduled = false;
              void nudgeIdleMainAgents(requireRuntimeController, workflowStore);
            }, 10_000);
          }
        },
        onCodingEngineEvent: (agentId, event) => {
          const ctrl = requireRuntimeController();
          ctrl.pushCodingEngineEvent(agentId, event);
        },
        workflowStore,
      }));

      runtimeController = new DesktopRuntimeController({
        agentIpcManager,
        agentStore: stores.agents,
        bundledAgentIpcDir: path.join(app.getAppPath(), 'src', 'shared', 'agent-ipc'),
        ...(agentLiteHomeDir ? { homeDir: agentLiteHomeDir } : {}),
        onAgentIdle: (_agentId) => {
          void nudgeIdleMainAgents(requireRuntimeController, workflowStore);
        },
        onIpcDirCreated: (agentId, agentName, projectId, ipcHostPath, ipcContainerPath) => {
          agentIpcManager.addConnection(agentId, agentName, projectId, ipcHostPath, ipcContainerPath);
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
        for (const window of BrowserWindow.getAllWindows()) {
          window.webContents.send(ipcChannels.runtimeSnapshotUpdated, snapshot);
        }
      });

      await migrateModelProviders({
        secretsStore: stores.secrets,
        settingsStore: stores.settings,
      });
      await runtimeController.start();
      await syncReadyAssignmentInboxes(await workflowStore.get('snapshot'));
      agentIpcManager.start();

      // Periodic check: nudge idle project-main agents when inbox is empty
      nudgeIntervalHandle = setInterval(() => {
        void nudgeIdleMainAgents(requireRuntimeController, workflowStore);
      }, NUDGE_INTERVAL_MS);
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
  ipcMain.handle(ipcChannels.startAgentIpc, async () => {
    await ensureRuntime();
  });
  ipcMain.handle(ipcChannels.stopAgentIpc, async () => {
    await ensureRuntime();
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

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
      scheduleRuntimeBootstrap(250);
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', (event) => {
  quitCoordinator.handleBeforeQuit(event);
});
