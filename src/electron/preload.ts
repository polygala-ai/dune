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
  exportAuditCsv: (params) => ipcRenderer.invoke(ipcChannels.exportAuditCsv, params),
  getProjectActivityPage: (projectId, options) =>
    ipcRenderer.invoke(ipcChannels.getProjectActivityPage, projectId, options),
  getAuditLog: (params) => ipcRenderer.invoke(ipcChannels.getAuditLog, params),
  getAgentTranscriptPage: (agentId, options) =>
    ipcRenderer.invoke(ipcChannels.getAgentTranscriptPage, agentId, options),
  getRuntimeSnapshot: () => ipcRenderer.invoke(ipcChannels.getRuntimeSnapshot),
  getTelegramSetupSession: (sessionId) =>
    ipcRenderer.invoke(ipcChannels.getTelegramSetupSession, sessionId),
  listProjectArtifactEntries: (rootPath, artifactFolderName) =>
    ipcRenderer.invoke(ipcChannels.listProjectArtifactEntries, rootPath, artifactFolderName),
  openExternal: (url) => ipcRenderer.invoke(ipcChannels.openExternal, url),
  openPath: (targetPath) => ipcRenderer.invoke(ipcChannels.openPath, targetPath),
  prepareProjectRootPath: (rootPath, artifactFolderNames) =>
    ipcRenderer.invoke(ipcChannels.prepareProjectRootPath, rootPath, artifactFolderNames),
  recordAuditEvent: (event) => ipcRenderer.invoke(ipcChannels.recordAuditEvent, event),
  reloadExternalChannels: () => ipcRenderer.invoke(ipcChannels.reloadExternalChannels),
  resetRuntime: () => ipcRenderer.invoke(ipcChannels.resetRuntime),
  restartApp: () => ipcRenderer.invoke(ipcChannels.restartApp),
  runIsolatedResearch: (agentId, input) =>
    ipcRenderer.invoke(ipcChannels.runIsolatedResearch, agentId, input),
  selectAgent: (agentId) => ipcRenderer.invoke(ipcChannels.selectAgent, agentId),
  updateAgentChannel: (input) => ipcRenderer.invoke(ipcChannels.updateAgentChannel, input),
  updateAgentDefinition: (agentId, definition) =>
    ipcRenderer.invoke(ipcChannels.updateAgentDefinition, agentId, definition),
  sendAgentMessage: (agentId, text) =>
    ipcRenderer.invoke(ipcChannels.sendAgentMessage, agentId, text),
  startTelegramSetupSession: (input) =>
    ipcRenderer.invoke(ipcChannels.startTelegramSetupSession, input),
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
  subscribeItemActivity: (listener) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      payload: Parameters<typeof listener>[0],
    ) => {
      listener(payload);
    };

    ipcRenderer.on(ipcChannels.itemActivityUpdated, handler);

    return () => {
      ipcRenderer.removeListener(ipcChannels.itemActivityUpdated, handler);
    };
  },
};

contextBridge.exposeInMainWorld('duneDesktop', Object.freeze(bridge));
