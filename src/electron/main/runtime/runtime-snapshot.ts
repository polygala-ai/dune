import type { AgentServiceSnapshot } from '@/shared/agents/agent-runtime';
import { ipcChannels } from '@/shared/electron/ipc-channels';

export interface RuntimeSnapshotController {
  getSnapshot: () => AgentServiceSnapshot;
}

export interface RuntimeSnapshotWindow {
  webContents: {
    send: (channel: string, snapshot: AgentServiceSnapshot) => void;
  };
}

export async function getBootstrappedRuntimeSnapshot(options: {
  createInitialRuntimeSnapshot: () => AgentServiceSnapshot;
  ensureRuntime: () => Promise<void>;
  getRuntimeController: () => RuntimeSnapshotController | null;
}) {
  await options.ensureRuntime();

  return options.getRuntimeController()?.getSnapshot()
    ?? options.createInitialRuntimeSnapshot();
}

export function pushCurrentRuntimeSnapshot(
  window: RuntimeSnapshotWindow,
  runtimeController: RuntimeSnapshotController | null,
) {
  if (!runtimeController) {
    return false;
  }

  window.webContents.send(
    ipcChannels.runtimeSnapshotUpdated,
    runtimeController.getSnapshot(),
  );

  return true;
}
