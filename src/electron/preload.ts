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
  getProjectActivityPage: (projectId, options) =>
    ipcRenderer.invoke(ipcChannels.getProjectActivityPage, projectId, options),
  getWorkflowSnapshot: () => ipcRenderer.invoke(ipcChannels.getWorkflowSnapshot),
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
  reloadExternalChannels: () => ipcRenderer.invoke(ipcChannels.reloadExternalChannels),
  resetRuntime: () => ipcRenderer.invoke(ipcChannels.resetRuntime),
  restartApp: () => ipcRenderer.invoke(ipcChannels.restartApp),
  runIsolatedResearch: (agentId, input) =>
    ipcRenderer.invoke(ipcChannels.runIsolatedResearch, agentId, input),
  deleteModelProviderSecret: (providerId) =>
    ipcRenderer.invoke(ipcChannels.deleteModelProviderSecret, providerId),
  loadCodingEngineSettings: () => ipcRenderer.invoke(ipcChannels.loadCodingEngineSettings),
  loadModelProviders: () => ipcRenderer.invoke(ipcChannels.loadModelProviders),
  loadNetworkSettings: () => ipcRenderer.invoke(ipcChannels.loadNetworkSettings),
  readModelProviderSecret: (providerId) =>
    ipcRenderer.invoke(ipcChannels.readModelProviderSecret, providerId),
  saveCodingEngineSettings: (settings) =>
    ipcRenderer.invoke(ipcChannels.saveCodingEngineSettings, settings),
  saveModelProviders: (providers) =>
    ipcRenderer.invoke(ipcChannels.saveModelProviders, providers),
  saveNetworkSettings: (settings) =>
    ipcRenderer.invoke(ipcChannels.saveNetworkSettings, settings),
  saveWorkflowSnapshot: (snapshot) =>
    ipcRenderer.invoke(ipcChannels.saveWorkflowSnapshot, snapshot),
  selectAgent: (agentId) => ipcRenderer.invoke(ipcChannels.selectAgent, agentId),
  updateAgentChannel: (input) => ipcRenderer.invoke(ipcChannels.updateAgentChannel, input),
  updateAgentDefinition: (agentId, definition) =>
    ipcRenderer.invoke(ipcChannels.updateAgentDefinition, agentId, definition),
  sendAgentMessage: (agentId, text) =>
    ipcRenderer.invoke(ipcChannels.sendAgentMessage, agentId, text),
  startTelegramSetupSession: (input) =>
    ipcRenderer.invoke(ipcChannels.startTelegramSetupSession, input),
  writeModelProviderSecret: (providerId, value) =>
    ipcRenderer.invoke(ipcChannels.writeModelProviderSecret, providerId, value),
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
