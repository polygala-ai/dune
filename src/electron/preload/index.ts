import {
  contextBridge,
  ipcRenderer,
} from 'electron';

import { createDesktopBridge } from '../../shared/electron/desktop-bridge';
import { runtimeIpcChannels } from '../../shared/electron/runtime-ipc';

const desktopBridge = Object.freeze(
  createDesktopBridge(process.platform, {
    createAgent: (input) => ipcRenderer.invoke(runtimeIpcChannels.createAgent, input),
    getRuntimeSnapshot: () => ipcRenderer.invoke(runtimeIpcChannels.getRuntimeSnapshot),
    resetRuntime: () => ipcRenderer.invoke(runtimeIpcChannels.resetRuntime),
    selectAgent: (agentId) => ipcRenderer.invoke(runtimeIpcChannels.selectAgent, agentId),
    sendAgentMessage: (agentId, text) =>
      ipcRenderer.invoke(runtimeIpcChannels.sendAgentMessage, agentId, text),
    subscribe: (listener) => {
      const handleRuntimeSnapshot = (
        _event: Electron.IpcRendererEvent,
        snapshot: Parameters<typeof listener>[0],
      ) => {
        listener(snapshot);
      };

      ipcRenderer.on(runtimeIpcChannels.runtimeSnapshotUpdated, handleRuntimeSnapshot);

      return () => {
        ipcRenderer.removeListener(
          runtimeIpcChannels.runtimeSnapshotUpdated,
          handleRuntimeSnapshot,
        );
      };
    },
  }),
);

contextBridge.exposeInMainWorld('duneDesktop', desktopBridge);
