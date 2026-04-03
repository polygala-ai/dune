import {
  contextBridge,
  ipcRenderer,
} from 'electron';

import type { DesktopBridge } from '../../shared/electron/desktop-bridge';
import { ipcChannels } from '../../shared/electron/ipc-channels';

const bridge: DesktopBridge = {
  platform: process.platform,
  createAgent: (input) => ipcRenderer.invoke(ipcChannels.createAgent, input),
  deleteAgent: (agentId) => ipcRenderer.invoke(ipcChannels.deleteAgent, agentId),
  getRuntimeSnapshot: () => ipcRenderer.invoke(ipcChannels.getRuntimeSnapshot),
  resetRuntime: () => ipcRenderer.invoke(ipcChannels.resetRuntime),
  restartApp: () => ipcRenderer.invoke(ipcChannels.restartApp),
  selectAgent: (agentId) => ipcRenderer.invoke(ipcChannels.selectAgent, agentId),
  sendAgentMessage: (agentId, text) =>
    ipcRenderer.invoke(ipcChannels.sendAgentMessage, agentId, text),
  storageDelete: (store, key) => ipcRenderer.invoke(ipcChannels.storageDelete, store, key),
  storageGet: (store, key) => ipcRenderer.invoke(ipcChannels.storageGet, store, key),
  storageKeys: (store) => ipcRenderer.invoke(ipcChannels.storageKeys, store),
  storageSet: (store, key, value) => ipcRenderer.invoke(ipcChannels.storageSet, store, key, value),
  subscribe: (listener) => {
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
};

contextBridge.exposeInMainWorld('duneDesktop', Object.freeze(bridge));
