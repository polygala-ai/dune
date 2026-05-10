// Main-process IPC handler registration.

import {
  BrowserWindow,
  clipboard as electronClipboard,
  dialog as electronDialog,
  ipcMain as electronIpcMain,
  shell as electronShell,
} from 'electron';
import type { OpenDialogOptions } from 'electron';

import type { DrizzleSettingsRepository } from '@/electron/main/persistence/settings-repository';
import type { WorkflowSnapshotStore } from '@/electron/main/persistence/workflow-repository';
import type { DesktopRuntimeController } from '@/electron/main/runtime/desktop-runtime-controller';
import {
  assertEmptyProjectRootDirectory,
  ensureProjectArtifactFolder,
  listProjectArtifactEntries,
  prepareProjectRootPath,
} from '@/electron/main/workflow/project-artifacts';
import type {
  CreateAgentInput,
  StartTelegramSetupSessionInput,
} from '@/renderer/features/agents/types';
import type { ModelProvider } from '@/renderer/features/settings/model/model-providers';
import {
  getAgentLiteBackendOptions,
  type CodingEngineSettings,
} from '@/renderer/features/settings/model/coding-engine-settings';
import type { NetworkSettings } from '@/renderer/features/settings/model/network-settings';
import type { WorkflowSnapshot } from '@/renderer/features/workflow/types';
import type { AgentServiceSnapshot } from '@/shared/agents/agent-runtime';
import { ipcChannels } from '@/shared/electron/ipc-channels';
import { getBootstrappedRuntimeSnapshot } from '@/electron/main/runtime/runtime-snapshot';

interface ClipboardLike {
  writeText(text: string): void;
}

interface DialogLike {
  showOpenDialog: (...args: any[]) => Promise<{ canceled: boolean; filePaths: string[] }>;
}

interface IpcMainLike {
  handle(channel: string, listener: (...args: any[]) => any): void;
}

interface ShellLike {
  openExternal(url: string): Promise<void>;
  openPath(targetPath: string): Promise<string>;
}

interface RegisterMainIpcHandlersOptions {
  applyPersistedNetworkSettings: () => Promise<void>;
  clipboard?: ClipboardLike;
  createInitialRuntimeSnapshot: () => AgentServiceSnapshot;
  deleteLocalData: () => Promise<void>;
  dialog?: DialogLike;
  ensureRuntime: () => Promise<void>;
  getFocusedWindow?: () => BrowserWindow | null;
  getMainWindow: () => BrowserWindow | null;
  getProjectActivityPage: (
    projectId: string,
    options?: { beforeEntryId?: string | null; limit?: number },
  ) => Promise<unknown>;
  getRuntimeController: () => DesktopRuntimeController | null;
  ipcMain?: IpcMainLike;
  requireRuntimeController: () => DesktopRuntimeController;
  restartApp: () => Promise<void> | void;
  settingsRepository: DrizzleSettingsRepository;
  shell?: ShellLike;
  workflowStore: WorkflowSnapshotStore;
}

/** Registers the Electron main-process IPC handlers. */
export function registerMainIpcHandlers(options: RegisterMainIpcHandlersOptions) {
  const clipboard = options.clipboard ?? electronClipboard;
  const dialog = options.dialog ?? electronDialog;
  const getFocusedWindow = options.getFocusedWindow ?? BrowserWindow.getFocusedWindow;
  const ipcMain = options.ipcMain ?? electronIpcMain;
  const shell = options.shell ?? electronShell;

  const withRuntime = async <T>(
    action: (runtimeController: DesktopRuntimeController) => Promise<T> | T,
  ) => {
    await options.ensureRuntime();
    return action(options.requireRuntimeController());
  };
  const refreshRuntimeModelCredentials = async () => {
    const runtimeController = options.getRuntimeController();

    if (runtimeController) {
      await runtimeController.reloadModelCredentials();
    }
  };

  // Runtime handlers.
  ipcMain.handle(ipcChannels.getRuntimeSnapshot, async () =>
    getBootstrappedRuntimeSnapshot({
      createInitialRuntimeSnapshot: options.createInitialRuntimeSnapshot,
      ensureRuntime: options.ensureRuntime,
      getRuntimeController: options.getRuntimeController,
    }));
  ipcMain.handle(
    ipcChannels.getAgentTranscriptPage,
    async (_event, agentId: string, pageOptions?: { beforeMessageId?: string | null; limit?: number }) =>
      withRuntime((runtimeController) => runtimeController.getTranscriptPage(agentId, pageOptions)),
  );
  ipcMain.handle(
    ipcChannels.getProjectActivityPage,
    async (_event, projectId: string, pageOptions?: { beforeEntryId?: string | null; limit?: number }) =>
      options.getProjectActivityPage(projectId, pageOptions),
  );
  ipcMain.handle(
    ipcChannels.applyNetworkSettings,
    async () => {
      await options.applyPersistedNetworkSettings();
      return withRuntime((runtimeController) => runtimeController.reloadExternalChannels());
    },
  );
  ipcMain.handle(
    ipcChannels.cancelTelegramSetupSession,
    async (_event, sessionId: string) =>
      withRuntime((runtimeController) => runtimeController.cancelTelegramSetupSession(sessionId)),
  );
  ipcMain.handle(
    ipcChannels.reloadExternalChannels,
    async () => withRuntime((runtimeController) => runtimeController.reloadExternalChannels()),
  );
  ipcMain.handle(
    ipcChannels.getTelegramSetupSession,
    async (_event, sessionId: string) =>
      withRuntime((runtimeController) => runtimeController.getTelegramSetupSession(sessionId)),
  );
  ipcMain.handle(
    ipcChannels.createAgent,
    async (_event, input: CreateAgentInput) =>
      withRuntime((runtimeController) => runtimeController.createAgent(input)),
  );
  ipcMain.handle(
    ipcChannels.ensureProjectMainAgent,
    async (
      _event,
      projectId: string,
      projectName: string,
      projectRootPath?: string | null,
    ) =>
      withRuntime((runtimeController) =>
        runtimeController.ensureProjectMainAgent(projectId, projectName, projectRootPath)),
  );
  ipcMain.handle(
    ipcChannels.deleteAgent,
    async (_event, agentId: string) =>
      withRuntime((runtimeController) => runtimeController.deleteAgent(agentId)),
  );
  ipcMain.handle(
    ipcChannels.selectAgent,
    async (_event, agentId: string) =>
      withRuntime((runtimeController) => runtimeController.selectAgent(agentId)),
  );
  ipcMain.handle(
    ipcChannels.updateAgentChannel,
    async (_event, input) =>
      withRuntime((runtimeController) => runtimeController.updateAgentChannel(input)),
  );
  ipcMain.handle(
    ipcChannels.updateAgentDefinition,
    async (_event, agentId: string, definition) =>
      withRuntime((runtimeController) => runtimeController.updateAgentDefinition(agentId, definition)),
  );
  ipcMain.handle(
    ipcChannels.sendAgentMessage,
    async (_event, agentId: string, text: string) =>
      withRuntime((runtimeController) => runtimeController.sendAgentMessage(agentId, text)),
  );
  ipcMain.handle(
    ipcChannels.startTelegramSetupSession,
    async (_event, input: StartTelegramSetupSessionInput) =>
      withRuntime((runtimeController) => runtimeController.startTelegramSetupSession(input)),
  );
  ipcMain.handle(
    ipcChannels.resetRuntime,
    async () => withRuntime((runtimeController) => runtimeController.reset()),
  );
  ipcMain.handle(
    ipcChannels.runIsolatedResearch,
    async (_event, agentId: string, input) =>
      withRuntime((runtimeController) => runtimeController.runIsolatedResearch(agentId, input)),
  );

  // Workflow and settings handlers.
  ipcMain.handle(
    ipcChannels.getWorkflowSnapshot,
    async () => options.workflowStore.readSnapshot(),
  );
  ipcMain.handle(
    ipcChannels.saveWorkflowSnapshot,
    async (_event, snapshot: WorkflowSnapshot) => options.workflowStore.writeSnapshot(snapshot),
  );
  ipcMain.handle(
    ipcChannels.loadModelProviders,
    async () => options.settingsRepository.loadModelProviders(),
  );
  ipcMain.handle(
    ipcChannels.saveModelProviders,
    async (_event, providers: ModelProvider[]) => {
      const savedProviders = await options.settingsRepository.saveModelProviders(providers);
      await refreshRuntimeModelCredentials();
      return savedProviders;
    },
  );
  ipcMain.handle(
    ipcChannels.readModelProviderSecret,
    async (_event, providerId: string) => options.settingsRepository.readModelProviderSecret(providerId),
  );
  ipcMain.handle(
    ipcChannels.writeModelProviderSecret,
    async (_event, providerId: string, value: string) => {
      await options.settingsRepository.writeModelProviderSecret(providerId, value);
      await refreshRuntimeModelCredentials();
    },
  );
  ipcMain.handle(
    ipcChannels.deleteModelProviderSecret,
    async (_event, providerId: string) => {
      await options.settingsRepository.deleteModelProviderSecret(providerId);
      await refreshRuntimeModelCredentials();
    },
  );
  ipcMain.handle(
    ipcChannels.loadNetworkSettings,
    async () => options.settingsRepository.loadNetworkSettings(),
  );
  ipcMain.handle(
    ipcChannels.saveNetworkSettings,
    async (_event, settings: NetworkSettings) => options.settingsRepository.saveNetworkSettings(settings),
  );
  ipcMain.handle(
    ipcChannels.loadCodingEngineSettings,
    async () => options.settingsRepository.loadCodingEngineSettings(),
  );
  ipcMain.handle(
    ipcChannels.saveCodingEngineSettings,
    async (_event, settings: CodingEngineSettings) => {
      const savedSettings = await options.settingsRepository.saveCodingEngineSettings(settings);
      await withRuntime((runtimeController) =>
        runtimeController.applyAgentBackendOptions(getAgentLiteBackendOptions(savedSettings)));
      return savedSettings;
    },
  );
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

  // Shell, dialog, and app handlers.
  ipcMain.handle(ipcChannels.copyText, (_event, text: string) => {
    clipboard.writeText(text);
  });
  ipcMain.handle(
    ipcChannels.openExternal,
    (_event, url: string) => shell.openExternal(url),
  );
  ipcMain.handle(
    ipcChannels.openPath,
    async (_event, targetPath: string) => {
      const errorMessage = await shell.openPath(targetPath);
      if (errorMessage) {
        throw new Error(errorMessage);
      }
    },
  );
  ipcMain.handle(
    ipcChannels.deleteLocalData,
    async () => options.deleteLocalData(),
  );
  ipcMain.handle(
    ipcChannels.selectProjectDirectory,
    async () => {
      const dialogTarget = options.getMainWindow() ?? getFocusedWindow() ?? undefined;
      const dialogOptions: OpenDialogOptions = {
        properties: ['openDirectory'],
        title: 'Choose an empty project folder',
      };
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
    },
  );
  ipcMain.handle(ipcChannels.restartApp, async () => options.restartApp());
}
