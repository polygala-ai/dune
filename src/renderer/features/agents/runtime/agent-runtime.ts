import type { DesktopBridge } from '@/shared/electron/desktop-bridge';
import type {
  AgentServiceListener,
  AgentServiceSnapshot,
} from '@/renderer/features/agents/model/agent-service';
import { cloneExternalChannelsState, createDefaultExternalChannelsState } from '@/renderer/features/agents/model/channels';
import {
  createMockAgentRuntime,
  type AgentRuntime,
} from '@/renderer/features/agents/services/mock-agent-service';
import type { CreateAgentInput } from '@/renderer/features/agents/types';

function createInitialBridgeSnapshot(): AgentServiceSnapshot {
  return {
    agents: [],
    externalChannels: createDefaultExternalChannelsState(),
    isStreaming: false,
    runtimeInfo: {
      message: 'Connecting to the desktop runtime.',
      mode: 'mock-fallback',
      status: 'starting',
    },
    selectedAgentId: null,
  };
}

function isPlaceholderBridgeSnapshot(snapshot: AgentServiceSnapshot) {
  return snapshot.runtimeInfo.status === 'starting'
    && snapshot.runtimeInfo.mode === 'mock-fallback'
    && snapshot.externalChannels.telegram.status === 'not-configured'
    && snapshot.externalChannels.telegram.discoveredChats.length === 0
    && !snapshot.externalChannels.telegram.configured
    && snapshot.agents.length === 0;
}

type ConnectedBridge = DesktopBridge & Required<
  Pick<
    DesktopBridge,
    'createAgent' | 'deleteAgent' | 'getRuntimeSnapshot' | 'selectAgent' | 'sendAgentMessage' | 'subscribe'
  >
>;

function hasRuntimeBridge(
  bridge: DesktopBridge | undefined,
): bridge is ConnectedBridge {
    return Boolean(
      bridge?.createAgent &&
      bridge.deleteAgent &&
      bridge.getRuntimeSnapshot &&
      bridge.selectAgent &&
      bridge.sendAgentMessage &&
      bridge.subscribe,
  );
}

class BridgeAgentRuntime implements AgentRuntime {
  private listeners = new Set<AgentServiceListener>();

  private snapshot: AgentServiceSnapshot = createInitialBridgeSnapshot();

  private readonly unsubscribeBridge: (() => void) | null;

  private readonly handleVisibilityChange = () => {
    if (document.visibilityState === 'visible') {
      void this.syncSnapshot('visibility');
    }
  };

  private readonly handleWindowFocus = () => {
    void this.syncSnapshot('focus');
  };

  readonly service = {
    createAgent: async (input: CreateAgentInput) => {
      return this.bridge.createAgent(input);
    },
    deleteAgent: async (agentId: string) => {
      await this.bridge.deleteAgent(agentId);
    },
    getSnapshot: () => this.getSnapshot(),
    listAgents: () => this.getSnapshot().agents,
    selectAgent: (agentId: string) => {
      void this.bridge.selectAgent(agentId);
    },
    sendMessage: async (agentId: string, text: string) => {
      await this.bridge.sendAgentMessage(agentId, text);
    },
    subscribe: (listener: AgentServiceListener) => this.subscribe(listener),
  };

  constructor(private readonly bridge: ConnectedBridge) {
    this.unsubscribeBridge = bridge.subscribe((snapshot) => {
      this.snapshot = snapshot;
      this.emit();
    });

    if (typeof window !== 'undefined') {
      window.addEventListener('focus', this.handleWindowFocus);
    }

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.handleVisibilityChange);
    }

    void this.syncSnapshot('bridge-init');
  }

  getSnapshot() {
    return {
      ...this.snapshot,
      agents: this.snapshot.agents.map((agent) => ({
        ...agent,
        channel: {
          ...agent.channel,
          target: agent.channel.target ? { ...agent.channel.target } : null,
        },
        contextCards: agent.contextCards.map((card) => ({ ...card })),
        messages: agent.messages.map((message) => ({ ...message })),
      })),
      externalChannels: cloneExternalChannelsState(this.snapshot.externalChannels),
      runtimeInfo: { ...this.snapshot.runtimeInfo },
    };
  }

  subscribe(listener: AgentServiceListener) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  reset() {
    if (this.bridge.resetRuntime) {
      void this.bridge.resetRuntime();
      return;
    }

    this.snapshot = createInitialBridgeSnapshot();
    this.emit();
  }

  dispose() {
    this.unsubscribeBridge?.();

    if (typeof window !== 'undefined') {
      window.removeEventListener('focus', this.handleWindowFocus);
    }

    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    }
  }

  async syncSnapshot(reason = 'manual') {
    const previousSnapshot = this.snapshot;
    const nextSnapshot = await this.bridge.getRuntimeSnapshot();

    this.snapshot = nextSnapshot;

    if (isPlaceholderBridgeSnapshot(previousSnapshot)
      && !isPlaceholderBridgeSnapshot(nextSnapshot)) {
      console.debug('Reconciled stale desktop runtime snapshot.', {
        reason,
        runtimeStatus: nextSnapshot.runtimeInfo.status,
        telegramConfigured: nextSnapshot.externalChannels.telegram.configured,
        telegramDiscoveredChats: nextSnapshot.externalChannels.telegram.discoveredChats.length,
      });
    }

    this.emit();

    return this.getSnapshot();
  }

  private emit() {
    const snapshot = this.getSnapshot();

    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }
}

type SyncableAgentRuntime = AgentRuntime & {
  syncSnapshot?: (reason?: string) => Promise<AgentServiceSnapshot>;
};

export function createAgentRuntime(
  desktopBridge: DesktopBridge | undefined = window.duneDesktop,
): AgentRuntime {
  if (hasRuntimeBridge(desktopBridge)) {
    return new BridgeAgentRuntime(desktopBridge);
  }

  return createMockAgentRuntime();
}

export const agentRuntime: AgentRuntime = createAgentRuntime();

export async function syncAgentRuntimeSnapshot(reason = 'manual') {
  if (typeof (agentRuntime as SyncableAgentRuntime).syncSnapshot === 'function') {
    return (agentRuntime as SyncableAgentRuntime).syncSnapshot!(reason);
  }

  if (typeof window.duneDesktop?.getRuntimeSnapshot === 'function') {
    const liveSnapshot = await window.duneDesktop.getRuntimeSnapshot();

    if (isPlaceholderBridgeSnapshot(agentRuntime.getSnapshot())
      && !isPlaceholderBridgeSnapshot(liveSnapshot)) {
      console.debug('Pulled a live desktop runtime snapshot without a syncable bridge runtime.', {
        reason,
        runtimeStatus: liveSnapshot.runtimeInfo.status,
        telegramConfigured: liveSnapshot.externalChannels.telegram.configured,
        telegramDiscoveredChats: liveSnapshot.externalChannels.telegram.discoveredChats.length,
      });
    }

    return liveSnapshot;
  }

  return agentRuntime.getSnapshot();
}
