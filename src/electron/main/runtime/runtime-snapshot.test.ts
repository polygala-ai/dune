import { describe, expect, it, vi } from 'vitest';

import {
  getBootstrappedRuntimeSnapshot,
  pushCurrentRuntimeSnapshot,
} from '@/electron/main/runtime/runtime-snapshot';
import { createDefaultExternalChannelsState } from '@/renderer/features/agents/model/channels';
import { ipcChannels } from '@/shared/electron/ipc-channels';

describe('runtime snapshot helpers', () => {
  it('waits for runtime bootstrap before returning the live snapshot', async () => {
    let runtimeReady = false;
    const ensureRuntime = vi.fn(async () => {
      runtimeReady = true;
    });
    const liveSnapshot = {
      agents: [],
      externalChannels: createDefaultExternalChannelsState(),
      isStreaming: false,
      runtimeInfo: {
        mode: 'real' as const,
        status: 'ready' as const,
      },
      selectedAgentId: null,
      telegramSetupSessions: [],
    };

    const snapshot = await getBootstrappedRuntimeSnapshot({
      createInitialRuntimeSnapshot: () => ({
        agents: [],
        externalChannels: createDefaultExternalChannelsState(),
        isStreaming: false,
        runtimeInfo: {
          mode: 'mock-fallback' as const,
          status: 'starting' as const,
        },
        selectedAgentId: null,
        telegramSetupSessions: [],
      }),
      ensureRuntime,
      getRuntimeController: () =>
        runtimeReady
          ? { getSnapshot: () => liveSnapshot }
          : null,
    });

    expect(ensureRuntime).toHaveBeenCalledTimes(1);
    expect(snapshot).toEqual(liveSnapshot);
  });

  it('pushes the current runtime snapshot into a loaded renderer window', () => {
    const send = vi.fn();
    const pushed = pushCurrentRuntimeSnapshot(
      {
        webContents: {
          send,
        },
      },
      {
        getSnapshot: () => ({
          agents: [],
          externalChannels: createDefaultExternalChannelsState(),
          isStreaming: false,
          runtimeInfo: {
            mode: 'real',
            status: 'ready',
          },
          selectedAgentId: null,
          telegramSetupSessions: [],
        }),
      },
    );

    expect(pushed).toBe(true);
    expect(send).toHaveBeenCalledWith(
      ipcChannels.runtimeSnapshotUpdated,
      expect.objectContaining({
        runtimeInfo: expect.objectContaining({
          mode: 'real',
          status: 'ready',
        }),
      }),
    );
  });
});
