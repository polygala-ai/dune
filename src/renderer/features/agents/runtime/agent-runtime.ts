// Renderer-side agent runtime adapter.

import type { DesktopBridge } from '@/shared/electron/desktop-bridge';
import type {
  AgentRuntimeContract,
  AgentServiceListener,
  AgentServiceSnapshot,
} from '@/shared/agents/agent-runtime';
import {
  cloneExternalChannelsState,
  cloneTelegramAgentRuntimeState,
  cloneTelegramSetupSession,
  createDefaultExternalChannelsState,
} from '@/renderer/features/agents/model/channels';
import { createMockAgentRuntime } from '@/renderer/features/agents/services/mock-agent-service';
import type {
  AgentDefinition,
  CreateAgentInput,
  RunIsolatedResearchInput,
  StartTelegramSetupSessionInput,
  UpdateAgentChannelInput,
} from '@/renderer/features/agents/types';

/** Creates initial bridge snapshot. */
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

/** Returns whether the snapshot is a placeholder bridge snapshot. */
function isPlaceholderBridgeSnapshot(snapshot: AgentServiceSnapshot) {
  return snapshot.runtimeInfo.status === 'starting'
    && snapshot.runtimeInfo.mode === 'mock-fallback'
    && snapshot.agents.length === 0;
}

/** Connected bridge shape. */
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

/** Returns whether runtime bridge exist. */
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

/** Implements bridge agent runtime behavior. */
class BridgeAgentRuntime implements AgentRuntimeContract {
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
    getTranscriptPage: async (
      agentId: string,
      options?: { beforeMessageId?: string | null; limit?: number },
    ) => {
      if (!this.bridge.getAgentTranscriptPage) {
        const snapshot = this.getSnapshot();
        const agent = snapshot.agents.find((candidate) => candidate.id === agentId);

        return {
          agentId,
          hasOlderMessages: false,
          messages: agent?.messages ?? [],
          totalMessageCount: agent?.messages.length ?? 0,
        };
      }

      return this.bridge.getAgentTranscriptPage(agentId, options);
    },
    getTelegramSetupSession: async (sessionId: string) => {
      return this.bridge.getTelegramSetupSession(sessionId);
    },
    getSnapshot: () => this.getSnapshot(),
    listAgents: () => this.getSnapshot().agents,
    runIsolatedResearch: async (agentId: string, input: RunIsolatedResearchInput) => {
      if (!this.bridge.runIsolatedResearch) {
        throw new Error('Isolated research is unavailable in this runtime.');
      }

      return this.bridge.runIsolatedResearch(agentId, input);
    },
    selectAgent: (agentId: string) => {
      void this.bridge.selectAgent(agentId);
    },
    sendMessage: async (agentId: string, text: string) => {
      await this.bridge.sendAgentMessage(agentId, text);
    },
    scheduleItemAssignment: () => Promise.resolve(null),
    cancelItemAssignment: () => Promise.resolve(),
    isItemTaskKnown: () => false,
    startTelegramSetupSession: async (input: StartTelegramSetupSessionInput) => {
      return this.bridge.startTelegramSetupSession(input);
    },
    subscribe: (listener: AgentServiceListener) => this.subscribe(listener),
    updateAgentChannel: async (input: UpdateAgentChannelInput) => {
      await this.bridge.updateAgentChannel(input);
    },
    updateAgentDefinition: async (agentId: string, definition: AgentDefinition) => {
      await this.bridge.updateAgentDefinition?.(agentId, definition);
    },
    postSystemMessage: async () => undefined,
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

  /** Returns snapshot. */
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
          ...(message.usage ? { usage: { ...message.usage } } : {}),
        })),
        transcript: { ...agent.transcript },
        telegram: cloneTelegramAgentRuntimeState(agent.telegram),
      })),
      externalChannels: cloneExternalChannelsState(this.snapshot.externalChannels),
      runtimeInfo: { ...this.snapshot.runtimeInfo },
      telegramSetupSessions: this.snapshot.telegramSetupSessions.map(cloneTelegramSetupSession),
    };
  }

  /** Subscribes to bridge agent updates. */
  subscribe(listener: AgentServiceListener) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Resets bridge agent. */
  reset() {
    if (this.bridge.resetRuntime) {
      void this.bridge.resetRuntime();
      return;
    }

    this.snapshot = createInitialBridgeSnapshot();
    this.emit();
  }

  /** Disposes bridge agent. */
  dispose() {
    this.unsubscribeBridge?.();

    if (typeof window !== 'undefined') {
      window.removeEventListener('focus', this.handleWindowFocus);
    }

    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    }
  }

  /** Synchronizes snapshot. */
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

/** Syncable agent runtime shape. */
type SyncableAgentRuntime = AgentRuntimeContract & {
  syncSnapshot?: (reason?: string) => Promise<AgentServiceSnapshot>;
};

/** Creates agent runtime. */
export function createAgentRuntime(
  desktopBridge: DesktopBridge | undefined = window.duneDesktop,
): AgentRuntimeContract {
  if (hasRuntimeBridge(desktopBridge)) {
    return new BridgeAgentRuntime(desktopBridge);
  }

  return createMockAgentRuntime();
}

/** Agent runtime constant. */
export const agentRuntime: AgentRuntimeContract = createAgentRuntime();

/** Synchronizes agent runtime snapshot. */
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
