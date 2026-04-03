import type { DesktopBridge } from '@/shared/electron/desktop-bridge';
import type {
  AgentServiceListener,
  AgentServiceSnapshot,
} from '@/renderer/features/agents/model/agent-service';
import {
  createMockAgentRuntime,
  type AgentRuntime,
} from '@/renderer/features/agents/services/mock-agent-service';
import type { CreateAgentInput } from '@/renderer/features/agents/types';

function createInitialBridgeSnapshot(): AgentServiceSnapshot {
  return {
    agents: [],
    isStreaming: false,
    runtimeInfo: {
      message: 'Connecting to the desktop runtime.',
      mode: 'mock-fallback',
      status: 'starting',
    },
    selectedAgentId: null,
  };
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

    void bridge.getRuntimeSnapshot().then((snapshot) => {
      this.snapshot = snapshot;
      this.emit();
    });
  }

  getSnapshot() {
    return {
      ...this.snapshot,
      agents: this.snapshot.agents.map((agent) => ({
        ...agent,
        channel: { ...agent.channel },
        contextCards: agent.contextCards.map((card) => ({ ...card })),
        messages: agent.messages.map((message) => ({ ...message })),
      })),
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
  }

  private emit() {
    const snapshot = this.getSnapshot();

    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }
}

function createAgentRuntime(): AgentRuntime {
  const desktopBridge = window.duneDesktop;

  if (hasRuntimeBridge(desktopBridge)) {
    return new BridgeAgentRuntime(desktopBridge);
  }

  return createMockAgentRuntime();
}

export const agentRuntime: AgentRuntime = createAgentRuntime();
