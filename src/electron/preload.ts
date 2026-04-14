// Electron preload bridge exposure.

import {
  contextBridge,
  ipcRenderer,
} from 'electron';

import type { DesktopBridge } from '@/shared/electron/desktop-bridge';
import { ipcChannels } from '@/shared/electron/ipc-channels';

const bridge: DesktopBridge = {
  applyNetworkSettings: () => ipcRenderer.invoke(ipcChannels.applyNetworkSettings),
  cancelTelegramSetupSession: (sessionId) =>
    ipcRenderer.invoke(ipcChannels.cancelTelegramSetupSession, sessionId),
  copyText: (text) => ipcRenderer.invoke(ipcChannels.copyText, text),
  platform: process.platform,
  createAgent: (input) => ipcRenderer.invoke(ipcChannels.createAgent, input),
  deleteLocalData: () => ipcRenderer.invoke(ipcChannels.deleteLocalData),
  deleteAgent: (agentId) => ipcRenderer.invoke(ipcChannels.deleteAgent, agentId),
  ensureProjectArtifactFolder: (rootPath, artifactFolderName) =>
    ipcRenderer.invoke(ipcChannels.ensureProjectArtifactFolder, rootPath, artifactFolderName),
  ensureProjectMainAgent: (projectId, projectName, projectRootPath) =>
    ipcRenderer.invoke(
      ipcChannels.ensureProjectMainAgent,
      projectId,
      projectName,
      projectRootPath,
    ),
  getRuntimeSnapshot: () => ipcRenderer.invoke(ipcChannels.getRuntimeSnapshot),
  getTelegramSetupSession: (sessionId) =>
    ipcRenderer.invoke(ipcChannels.getTelegramSetupSession, sessionId),
  listProjectArtifactEntries: (rootPath, artifactFolderName) =>
    ipcRenderer.invoke(ipcChannels.listProjectArtifactEntries, rootPath, artifactFolderName),
  openExternal: (url) => ipcRenderer.invoke(ipcChannels.openExternal, url),
  openPath: (targetPath) => ipcRenderer.invoke(ipcChannels.openPath, targetPath),
  prepareProjectRootPath: (rootPath, artifactFolderNames) =>
    ipcRenderer.invoke(ipcChannels.prepareProjectRootPath, rootPath, artifactFolderNames),
  reloadExternalChannels: () => ipcRenderer.invoke(ipcChannels.reloadExternalChannels),
  resetRuntime: () => ipcRenderer.invoke(ipcChannels.resetRuntime),
  restartApp: () => ipcRenderer.invoke(ipcChannels.restartApp),
  selectAgent: (agentId) => ipcRenderer.invoke(ipcChannels.selectAgent, agentId),
  updateAgentChannel: (input) => ipcRenderer.invoke(ipcChannels.updateAgentChannel, input),
  sendAgentMessage: (agentId, text) =>
    ipcRenderer.invoke(ipcChannels.sendAgentMessage, agentId, text),
  startAgentIpc: () => ipcRenderer.invoke(ipcChannels.startAgentIpc),
  startTelegramSetupSession: (input) =>
    ipcRenderer.invoke(ipcChannels.startTelegramSetupSession, input),
  stopAgentIpc: () => ipcRenderer.invoke(ipcChannels.stopAgentIpc),
  storageDelete: (store, key) => ipcRenderer.invoke(ipcChannels.storageDelete, store, key),
  storageGet: (store, key) => ipcRenderer.invoke(ipcChannels.storageGet, store, key),
  storageKeys: (store) => ipcRenderer.invoke(ipcChannels.storageKeys, store),
  storageSet: (store, key, value) => ipcRenderer.invoke(ipcChannels.storageSet, store, key, value),
  selectProjectDirectory: () => ipcRenderer.invoke(ipcChannels.selectProjectDirectory),
  subscribe: (listener) => {
    /** Handles snapshot. */
    const handleSnapshot = (
      _event: Electron.IpcRendererEvent,
      snapshot: Parameters<typeof listener>[0],
    ) => {
      listener(snapshot);
    };

    ipcRenderer.on(ipcChannels.runtimeSnapshotUpdated, handleSnapshot);

    return () => {
      ipcRenderer.removeListener(ipcChannels.runtimeSnapshotUpdated, handleSnapshot);
    };
  },
  subscribeWorkflowChanged: (listener) => {
    const handler = () => listener();
    ipcRenderer.on(ipcChannels.workflowChanged, handler);
    return () => {
      ipcRenderer.removeListener(ipcChannels.workflowChanged, handler);
    };
  },
};

contextBridge.exposeInMainWorld('duneDesktop', Object.freeze(bridge));
