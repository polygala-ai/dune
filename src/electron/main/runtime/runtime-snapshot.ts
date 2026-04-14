// Runtime snapshot persistence and renderer fan-out.

import type { AgentServiceSnapshot } from '@/shared/agents/agent-runtime';
import { ipcChannels } from '@/shared/electron/ipc-channels';

/** Runtime snapshot controller shape. */
export interface RuntimeSnapshotController {
  getSnapshot: () => AgentServiceSnapshot;
}

/** Runtime snapshot window shape. */
export interface RuntimeSnapshotWindow {
  webContents: {
    send: (channel: string, snapshot: AgentServiceSnapshot) => void;
  };
}

/** Returns bootstrapped runtime snapshot. */
export async function getBootstrappedRuntimeSnapshot(options: {
  createInitialRuntimeSnapshot: () => AgentServiceSnapshot;
  ensureRuntime: () => Promise<void>;
  getRuntimeController: () => RuntimeSnapshotController | null;
}) {
  await options.ensureRuntime();

  return options.getRuntimeController()?.getSnapshot()
    ?? options.createInitialRuntimeSnapshot();
}

/** Pushes current runtime snapshot. */
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
