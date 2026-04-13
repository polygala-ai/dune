import type { DesktopBridge } from '@/shared/electron/desktop-bridge';
import type {
  AgentServiceListener,
  AgentServiceSnapshot,
} from '@/renderer/features/agents/model/agent-service';
import {
  cloneExternalChannelsState,
  cloneTelegramAgentRuntimeState,
  cloneTelegramSetupSession,
  createDefaultExternalChannelsState,
} from '@/renderer/features/agents/model/channels';
import {
  createMockAgentRuntime,
  type AgentRuntime,
} from '@/renderer/features/agents/services/mock-agent-service';
import type {
  CreateAgentInput,
  StartTelegramSetupSessionInput,
  UpdateAgentChannelInput,
} from '@/renderer/features/agents/types';
import type { ReadyAssignmentsInboxSignal } from '@/shared/agents/ready-assignments';

function createInitialBridgeSnapshot(): AgentServiceSnapshot {
  return {
    agents: [],
    codingEngines: [],
    externalChannels: createDefaultExternalChannelsState(),
    isStreaming: false,
    runtimeInfo: {
      message: 'Connecting to the desktop runtime.',
      mode: 'mock-fallback',
      status: 'starting',
    },
    selectedAgentId: null,
    telegramSetupSessions: [],
  };
}

function isPlaceholderBridgeSnapshot(snapshot: AgentServiceSnapshot) {
  return snapshot.runtimeInfo.status === 'starting'
    && snapshot.runtimeInfo.mode === 'mock-fallback'
    && snapshot.agents.length === 0;
}

type ConnectedBridge = DesktopBridge & Required<
  Pick<
    DesktopBridge,
    | 'createAgent'
    | 'cancelTelegramSetupSession'
    | 'deleteAgent'
    | 'ensureProjectMainAgent'
    | 'getRuntimeSnapshot'
    | 'getTelegramSetupSession'
    | 'selectAgent'
    | 'sendAgentMessage'
    | 'startTelegramSetupSession'
    | 'updateAgentChannel'
    | 'subscribe'
  >
>;

function hasRuntimeBridge(
  bridge: DesktopBridge | undefined,
): bridge is ConnectedBridge {
    return Boolean(
      bridge?.createAgent &&
      bridge.cancelTelegramSetupSession &&
      bridge.deleteAgent &&
      bridge.ensureProjectMainAgent &&
      bridge.getRuntimeSnapshot &&
      bridge.getTelegramSetupSession &&
      bridge.selectAgent &&
      bridge.sendAgentMessage &&
      bridge.startTelegramSetupSession &&
      bridge.updateAgentChannel &&
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
    cancelTelegramSetupSession: async (sessionId: string) => {
      await this.bridge.cancelTelegramSetupSession(sessionId);
    },
    createAgent: async (input: CreateAgentInput) => {
      return this.bridge.createAgent(input);
    },
    deleteAgent: async (agentId: string) => {
      await this.bridge.deleteAgent(agentId);
    },
    ensureProjectMainAgent: async (
      projectId: string,
      projectName: string,
      projectRootPath?: string | null,
    ) => {
      return this.bridge.ensureProjectMainAgent(projectId, projectName, projectRootPath);
    },
    getTelegramSetupSession: async (sessionId: string) => {
      return this.bridge.getTelegramSetupSession(sessionId);
    },
    getSnapshot: () => this.getSnapshot(),
    listAgents: () => this.getSnapshot().agents,
    selectAgent: (agentId: string) => {
      void this.bridge.selectAgent(agentId);
    },
    sendMessage: async (agentId: string, text: string) => {
      await this.bridge.sendAgentMessage(agentId, text);
    },
    signalReadyAssignmentInbox: async (
      _agentId: string,
      _signal: ReadyAssignmentsInboxSignal,
    ) => undefined,
    startTelegramSetupSession: async (input: StartTelegramSetupSessionInput) => {
      return this.bridge.startTelegramSetupSession(input);
    },
    subscribe: (listener: AgentServiceListener) => this.subscribe(listener),
    updateAgentChannel: async (input: UpdateAgentChannelInput) => {
      await this.bridge.updateAgentChannel(input);
    },
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
        messages: agent.messages.map((message) => ({
          ...message,
          attachments: message.attachments.map((attachment) => ({ ...attachment })),
        })),
        telegram: cloneTelegramAgentRuntimeState(agent.telegram),
      })),
      externalChannels: cloneExternalChannelsState(this.snapshot.externalChannels),
      runtimeInfo: { ...this.snapshot.runtimeInfo },
      telegramSetupSessions: this.snapshot.telegramSetupSessions.map(cloneTelegramSetupSession),
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
        telegramSetupSessions: nextSnapshot.telegramSetupSessions.length,
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
        telegramSetupSessions: liveSnapshot.telegramSetupSessions.length,
      });
    }

    return liveSnapshot;
  }

  return agentRuntime.getSnapshot();
}
