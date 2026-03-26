import { describe, expect, it } from 'vitest';

import { createDesktopBridge } from '@/shared/electron/desktop-bridge';

describe('createDesktopBridge', () => {
  it('maps the platform into a renderer-safe bridge object', () => {
    expect(createDesktopBridge('darwin')).toEqual({
      isMac: true,
      platform: 'darwin',
    });
    expect(createDesktopBridge('win32')).toEqual({
      isMac: false,
      platform: 'win32',
    });
  });

  it('merges runtime methods into the bridge surface when provided', async () => {
    const createAgent = async () => 'agent-1';
    const getRuntimeSnapshot = async () => ({
      agents: [],
      isStreaming: false,
      runtimeInfo: {
        mode: 'real' as const,
        status: 'ready' as const,
      },
      selectedAgentId: null,
    });

    const bridge = createDesktopBridge('darwin', {
      createAgent,
      getRuntimeSnapshot,
    });

    expect(bridge.createAgent).toBe(createAgent);
    expect(await bridge.getRuntimeSnapshot?.()).toEqual({
      agents: [],
      isStreaming: false,
      runtimeInfo: {
        mode: 'real',
        status: 'ready',
      },
      selectedAgentId: null,
    });
  });
});
