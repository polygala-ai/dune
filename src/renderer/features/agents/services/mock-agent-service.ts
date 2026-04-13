import type {
  AgentService,
  AgentServiceListener,
  AgentServiceSnapshot,
} from '@/renderer/features/agents/model/agent-service';
import type {
  Agent,
  AgentExternalTarget,
  AgentMessage,
  AgentRole,
  AgentRuntimeInfo,
  CreateAgentInput,
  StartTelegramSetupSessionInput,
  TelegramSetupSession,
  UpdateAgentChannelInput,
} from '@/renderer/features/agents/types';
import {
  cloneExternalChannelsState,
  createChannelBinding,
  createDefaultExternalChannelsState,
  createDefaultTelegramAgentRuntimeState,
  cloneTelegramAgentRuntimeState,
  cloneTelegramSetupSession,
} from '@/renderer/features/agents/model/channels';
import { summarizeMessagePreview } from '@/shared/agents/message-content';
import { createProjectMainAgentName } from '@/shared/agents/project-main-name';
import type { ReadyAssignmentsInboxSignal } from '@/shared/agents/ready-assignments';

function createAgentId(name: string, now: number) {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'agent';

  return `agent-${slug}-${now}`;
}

function createMessageId(role: AgentMessage['role'], now: number) {
  return `message-${role}-${now}-${Math.random().toString(36).slice(2, 8)}`;
}

function summarizePreview(content: string) {
  return summarizeMessagePreview(content);
}

function createExternalAgentCopy(attachedLabel: string) {
  return {
    note: `This prototype agent mirrors ${attachedLabel} through Telegram. Real channel wiring lands in the AgentLite phase.`,
    preview: `Attached to ${attachedLabel}. Dune mirrors the transcript.`,
  };
}

function createDraftAgent(
  name: string,
  now: number,
  channelId: CreateAgentInput['channelId'],
  externalTarget: AgentExternalTarget | null,
  telegramSetupSession: TelegramSetupSession | null,
  projectId: string | null,
  role: AgentRole,
): Agent {
  const telegramState = channelId === 'telegram'
    ? createDefaultTelegramAgentRuntimeState({
        botUsername: telegramSetupSession?.botUsername ?? null,
        boundChat: externalTarget,
        errorMessage: telegramSetupSession?.errorMessage ?? null,
        pairingStatus: 'idle',
        status: telegramSetupSession?.status ?? 'connected',
      })
    : null;
  const channel = createChannelBinding(channelId, {
    telegram: telegramState,
    target: externalTarget,
  });
  const isBuiltInChannel = channel.kind === 'built-in';
  const attachedLabel = channel.target?.name ?? channel.label;

  return {
    channel,
    id: createAgentId(name, now),
    name,
    note:
      isBuiltInChannel
        ? 'This prototype agent stays inside Dune while the app is open. AgentLite runtime wiring lands in the next phase.'
        : `This prototype agent mirrors ${attachedLabel} through ${channel.label}. Real channel wiring lands in the AgentLite phase.`,
    preview: isBuiltInChannel
      ? 'Ready for a first instruction.'
      : `Attached to ${attachedLabel}. Dune mirrors the transcript.`,
    projectId,
    activityEvents: [],
    codingEngineEvents: [],
    role,
    telegram: telegramState,
    updatedAt: now,
    status: 'draft',
    workspace: 'Prototype agent',
    contextCards: [],
    messages: [],
  };
}

function createUserMessage(content: string, now: number): AgentMessage {
  return {
    attachments: [],
    id: createMessageId('user', now),
    role: 'user',
    content,
    createdAt: now,
    format: 'markdown',
    status: 'complete',
  };
}

function createAssistantMessage(now: number): AgentMessage {
  return {
    attachments: [],
    id: createMessageId('assistant', now),
    role: 'assistant',
    content: '',
    createdAt: now,
    format: 'markdown',
    status: 'streaming',
  };
}

function pickResponse(agent: Agent, input: string) {
  const normalized = input.toLowerCase();

  if (normalized.includes('settings')) {
    return [
      `For ${agent.name}, keep the settings surface descriptive rather than over-configured.`,
      '',
      '- Focus on labels that imply long-lived agents, not disposable prompts.',
      '- Keep the shell calm and editorial.',
      '- Leave runtime-specific controls for the AgentLite integration phase.',
    ].join('\n');
  }

  if (normalized.includes('agent')) {
    return [
      `${agent.name} should feel like a durable workspace, not a renamed prompt flow.`,
      '',
      'Keep the transcript generous, keep the command path fast, and make the creation flow name-first so the model reads as agent orchestration from the start.',
    ].join('\n');
  }

  return [
    `Working inside ${agent.name}, the next pass should sharpen the agent shell rather than add more chrome.`,
    '',
    'Keep the sidebar focused on agents, keep the composer steady, and let the transcript remain the dominant surface.',
  ].join('\n');
}

function splitIntoChunks(content: string) {
  const chunks: string[] = [];

  for (let index = 0; index < content.length; index += 28) {
    chunks.push(content.slice(index, index + 28));
  }

  return chunks;
}

function cloneSnapshot(snapshot: AgentServiceSnapshot): AgentServiceSnapshot {
  return {
    agents: snapshot.agents.map((agent) => ({
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
      projectId: agent.projectId ?? null,
      role: agent.role,
      telegram: cloneTelegramAgentRuntimeState(agent.telegram),
    })),
    externalChannels: cloneExternalChannelsState(snapshot.externalChannels),
    isStreaming: snapshot.isStreaming,
    codingEngines: snapshot.codingEngines.map((e) => ({ ...e })),
    runtimeInfo: { ...snapshot.runtimeInfo },
    selectedAgentId: snapshot.selectedAgentId,
    telegramSetupSessions: snapshot.telegramSetupSessions.map(cloneTelegramSetupSession),
  };
}

function createDefaultRuntimeInfo(): AgentRuntimeInfo {
  return {
    message: 'AgentLite is unavailable, so Dune is using the mock runtime.',
    mode: 'mock-fallback',
    status: 'ready',
  };
}

export interface AgentRuntime {
  getSnapshot: () => AgentServiceSnapshot;
  reset: () => void;
  service: AgentService;
  subscribe: (listener: AgentServiceListener) => () => void;
}

interface PendingTimerRecord {
  resolve: (completed: boolean) => void;
  timer: ReturnType<typeof globalThis.setTimeout>;
}

class MockAgentService implements AgentService {
  private listeners = new Set<AgentServiceListener>();

  private pendingTimersByAgent = new Map<string, Set<PendingTimerRecord>>();

  private streamingAgentIds = new Set<string>();

  private snapshot: AgentServiceSnapshot;

  private telegramSetupSessions = new Map<string, TelegramSetupSession>();

  constructor(runtimeInfo?: AgentRuntimeInfo) {
    this.snapshot = {
      agents: [],
      codingEngines: [],
      externalChannels: createDefaultExternalChannelsState(),
      isStreaming: false,
      runtimeInfo: runtimeInfo ?? createDefaultRuntimeInfo(),
      selectedAgentId: null,
      telegramSetupSessions: [],
    };
  }

  getSnapshot() {
    return cloneSnapshot(this.snapshot);
  }

  cancelTelegramSetupSession(sessionId: string) {
    this.telegramSetupSessions.delete(sessionId);
    this.syncTelegramSetupSessionsSnapshot();
    this.emit();

    return Promise.resolve();
  }

  getTelegramSetupSession(sessionId: string) {
    const session = this.telegramSetupSessions.get(sessionId) ?? null;
    return Promise.resolve(session ? cloneTelegramSetupSession(session) : null);
  }

  listAgents() {
    return this.getSnapshot().agents;
  }

  subscribe(listener: AgentServiceListener) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  selectAgent(agentId: string) {
    const agentExists = this.snapshot.agents.some((agent) => agent.id === agentId);

    if (!agentExists) {
      return;
    }

    this.snapshot = {
      ...this.snapshot,
      selectedAgentId: agentId,
    };
    this.emit();
  }

  createAgent(input: CreateAgentInput) {
    const trimmedName = input.name.trim();

    if (!trimmedName) {
      throw new Error('Agent name is required.');
    }

    if (input.channelId === 'telegram') {
      const telegramSessionId = input.telegramSetupSessionId?.trim() ?? '';
      const telegramSession = telegramSessionId
        ? this.telegramSetupSessions.get(telegramSessionId) ?? null
        : null;

      if (!telegramSession?.matchedChat) {
        throw new Error('Telegram pairing must finish before creating the agent.');
      }
    } else if (input.channelId !== 'dune-chat' && !input.externalTarget) {
      throw new Error('External channel target is required.');
    }

    const now = Date.now();
    const telegramSession = input.channelId === 'telegram'
      ? this.telegramSetupSessions.get(input.telegramSetupSessionId ?? '') ?? null
      : null;
    const externalTarget = input.channelId === 'telegram'
      ? telegramSession?.matchedChat ?? null
      : input.externalTarget ?? null;
    const nextAgent = createDraftAgent(
      trimmedName,
      now,
      input.channelId,
      externalTarget,
      telegramSession,
      input.projectId ?? null,
      'custom',
    );

    if (input.channelId === 'telegram' && telegramSession) {
      this.telegramSetupSessions.delete(telegramSession.id);
    }

    this.snapshot = {
      ...this.snapshot,
      agents: [nextAgent, ...this.snapshot.agents],
      selectedAgentId: nextAgent.id,
    };
    this.syncTelegramSetupSessionsSnapshot();
    this.emit();

    return Promise.resolve(nextAgent.id);
  }

  ensureProjectMainAgent(
    projectId: string,
    projectName: string,
    _projectRootPath?: string | null,
  ) {
    const trimmedProjectId = projectId.trim();
    const trimmedProjectName = projectName.trim();

    if (!trimmedProjectId) {
      throw new Error('Project id is required.');
    }

    if (!trimmedProjectName) {
      throw new Error('Project name is required.');
    }

    const existingAgent = this.snapshot.agents.find((agent) =>
      agent.projectId === trimmedProjectId && agent.role === 'project-main',
    );
    const expectedName = createProjectMainAgentName(trimmedProjectId);

    if (existingAgent) {
      if (existingAgent.name === expectedName) {
        return Promise.resolve(existingAgent.id);
      }

      this.snapshot = {
        ...this.snapshot,
        agents: this.snapshot.agents.map((agent) =>
          agent.id === existingAgent.id
            ? {
                ...agent,
                name: expectedName,
                preview: agent.preview,
                updatedAt: Date.now(),
              }
            : agent,
        ),
      };
      this.emit();

      return Promise.resolve(existingAgent.id);
    }

    const now = Date.now();
    const nextAgent = createDraftAgent(
      expectedName,
      now,
      'dune-chat',
      null,
      null,
      trimmedProjectId,
      'project-main',
    );

    this.snapshot = {
      ...this.snapshot,
      agents: [nextAgent, ...this.snapshot.agents],
    };
    this.emit();

    return Promise.resolve(nextAgent.id);
  }

  startTelegramSetupSession(input: StartTelegramSetupSessionInput) {
    const token = input.token?.trim() ?? '';

    if (!token && !input.agentId) {
      throw new Error('Telegram bot token is required.');
    }

    const sessionId = `telegram-session-${Math.random().toString(36).slice(2, 10)}`;
    const code = Math.random().toString(36).slice(2, 8).toUpperCase();
    const session: TelegramSetupSession = {
      agentId: input.agentId?.trim() ?? null,
      botUsername: 'mock_telegram_bot',
      errorMessage: null,
      id: sessionId,
      matchedChat: null,
      pairCode: code,
      pairExpiresAt: Date.now() + 10 * 60 * 1000,
      pairingStatus: 'listening',
      status: 'connected',
    };

    if (session.agentId) {
      for (const existingSession of [...this.telegramSetupSessions.values()]) {
        if (existingSession.agentId === session.agentId) {
          this.telegramSetupSessions.delete(existingSession.id);
        }
      }
    }

    this.telegramSetupSessions.set(sessionId, session);
    this.syncTelegramSetupSessionsSnapshot();
    this.emit();

    return Promise.resolve(sessionId);
  }

  updateAgentChannel(input: UpdateAgentChannelInput) {
    const agentId = input.agentId.trim();
    const channelId = input.channelId;
    const agent = this.snapshot.agents.find((item) => item.id === agentId);

    if (!agent) {
      throw new Error(`Agent "${input.agentId}" was not found.`);
    }

    if (channelId === 'telegram') {
      const setupSessionId = input.telegramSetupSessionId?.trim() ?? '';
      const setupSession = setupSessionId
        ? this.telegramSetupSessions.get(setupSessionId) ?? null
        : null;

      if (!setupSession?.matchedChat) {
        throw new Error('Telegram pairing must finish before changing the channel.');
      }

      const telegramState = createDefaultTelegramAgentRuntimeState({
        botUsername: setupSession.botUsername,
        boundChat: setupSession.matchedChat,
        errorMessage: setupSession.errorMessage,
        pairingStatus: 'matched',
        status: setupSession.status,
      });
      const copy = createExternalAgentCopy(setupSession.matchedChat.name);

      this.telegramSetupSessions.delete(setupSession.id);
      this.snapshot = {
        ...this.snapshot,
        agents: this.snapshot.agents.map((item) =>
          item.id === agentId
            ? {
                ...item,
                channel: createChannelBinding('telegram', {
                  target: setupSession.matchedChat,
                  telegram: telegramState,
                }),
                note: copy.note,
                preview: copy.preview,
                telegram: telegramState,
              }
            : item
        ),
      };
      this.syncTelegramSetupSessionsSnapshot();
      this.emit();
      return Promise.resolve();
    }

    if (channelId !== 'dune-chat') {
      throw new Error(`${channelId} is not available yet.`);
    }

    for (const session of [...this.telegramSetupSessions.values()]) {
      if (session.agentId === agentId) {
        this.telegramSetupSessions.delete(session.id);
      }
    }

    this.snapshot = {
      ...this.snapshot,
      agents: this.snapshot.agents.map((item) =>
        item.id === agentId
          ? {
              ...item,
              channel: createChannelBinding('dune-chat'),
              note: 'This prototype agent stays inside Dune while the app is open. AgentLite runtime wiring lands in the next phase.',
              preview: 'Ready for a first instruction.',
              telegram: null,
            }
          : item
      ),
    };
    this.syncTelegramSetupSessionsSnapshot();
    this.emit();

    return Promise.resolve();
  }

  deleteAgent(agentId: string) {
    const agentExists = this.snapshot.agents.some((agent) => agent.id === agentId);

    if (!agentExists) {
      return Promise.resolve();
    }

    this.clearPendingTimers(agentId);
    this.streamingAgentIds.delete(agentId);
    const nextAgents = this.snapshot.agents.filter((agent) => agent.id !== agentId);
    const nextSelectedAgentId = this.snapshot.selectedAgentId === agentId
      ? nextAgents[0]?.id ?? null
      : this.snapshot.selectedAgentId;

    this.snapshot = {
      ...this.snapshot,
      agents: nextAgents,
      isStreaming: this.streamingAgentIds.size > 0,
      selectedAgentId: nextSelectedAgentId,
    };
    for (const session of [...this.telegramSetupSessions.values()]) {
      if (session.agentId === agentId) {
        this.telegramSetupSessions.delete(session.id);
      }
    }
    this.syncTelegramSetupSessionsSnapshot();
    this.emit();

    return Promise.resolve();
  }

  async sendMessage(agentId: string, text: string) {
    const trimmedText = text.trim();

    if (!trimmedText || this.streamingAgentIds.has(agentId)) {
      return;
    }

    const agent = this.snapshot.agents.find((item) => item.id === agentId);

    if (!agent || !agent.channel.canCompose) {
      return;
    }

    const now = Date.now();
    const assistantMessage = createAssistantMessage(now);
    const userMessage = createUserMessage(trimmedText, now);
    this.streamingAgentIds.add(agentId);

    this.snapshot = {
      ...this.snapshot,
      agents: this.snapshot.agents.map((item) =>
        item.id === agentId
          ? {
              ...item,
              messages: [...item.messages, userMessage, assistantMessage],
              preview: summarizePreview(trimmedText),
              status: 'live',
              updatedAt: now,
            }
          : item,
      ),
      isStreaming: true,
      selectedAgentId: agentId,
    };
    this.emit();

    const response = pickResponse(agent, trimmedText);
    const chunks = splitIntoChunks(response);
    let streamedContent = '';

    for (const [index, chunk] of chunks.entries()) {
      const completedDelay = await this.wait(agentId, index === 0 ? 120 : 70);

      if (!completedDelay || !this.snapshot.agents.some((item) => item.id === agentId)) {
        this.streamingAgentIds.delete(agentId);
        return;
      }

      streamedContent += chunk;

      this.snapshot = {
        ...this.snapshot,
        agents: this.snapshot.agents.map((item) =>
          item.id === agentId
            ? {
                ...item,
                messages: item.messages.map((message) =>
                  message.id === assistantMessage.id
                    ? {
                        ...message,
                        content: streamedContent,
                        status: 'streaming',
                      }
                    : message,
                ),
                updatedAt: Date.now(),
              }
            : item,
        ),
      };
      this.emit();
    }

    if (!this.snapshot.agents.some((item) => item.id === agentId)) {
      this.streamingAgentIds.delete(agentId);
      return;
    }

    this.streamingAgentIds.delete(agentId);
    this.snapshot = {
      ...this.snapshot,
      agents: this.snapshot.agents.map((item) =>
        item.id === agentId
          ? {
              ...item,
              messages: item.messages.map((message) =>
                message.id === assistantMessage.id
                  ? {
                      ...message,
                      content: streamedContent,
                      status: 'complete',
                    }
                  : message,
              ),
              preview: summarizePreview(streamedContent),
              status: 'ready',
              updatedAt: Date.now(),
            }
          : item,
      ),
      isStreaming: this.streamingAgentIds.size > 0,
    };
    this.emit();
  }

  signalReadyAssignmentInbox(_agentId: string, _signal: ReadyAssignmentsInboxSignal) {
    return Promise.resolve();
  }

  reset() {
    this.clearAllPendingTimers();
    this.streamingAgentIds.clear();
    this.snapshot = {
      agents: [],
      codingEngines: [],
      externalChannels: cloneExternalChannelsState(this.snapshot.externalChannels),
      isStreaming: false,
      runtimeInfo: { ...this.snapshot.runtimeInfo },
      selectedAgentId: null,
      telegramSetupSessions: [],
    };
    this.telegramSetupSessions.clear();
    this.emit();
  }

  private emit() {
    const nextSnapshot = this.getSnapshot();

    for (const listener of this.listeners) {
      listener(nextSnapshot);
    }
  }

  private wait(agentId: string, duration: number) {
    return new Promise<boolean>((resolve) => {
      const timers = this.pendingTimersByAgent.get(agentId) ?? new Set<PendingTimerRecord>();
      const pendingTimer: PendingTimerRecord = {
        resolve,
        timer: globalThis.setTimeout(() => {
          timers.delete(pendingTimer);

          if (timers.size === 0) {
            this.pendingTimersByAgent.delete(agentId);
          }

          resolve(true);
        }, duration),
      };

      timers.add(pendingTimer);
      this.pendingTimersByAgent.set(agentId, timers);
    });
  }

  private clearPendingTimers(agentId: string) {
    const timers = this.pendingTimersByAgent.get(agentId);

    if (!timers) {
      return;
    }

    for (const pendingTimer of timers) {
      globalThis.clearTimeout(pendingTimer.timer);
      pendingTimer.resolve(false);
    }

    this.pendingTimersByAgent.delete(agentId);
  }

  private clearAllPendingTimers() {
    for (const agentId of [...this.pendingTimersByAgent.keys()]) {
      this.clearPendingTimers(agentId);
    }
  }

  private syncTelegramSetupSessionsSnapshot() {
    this.snapshot = {
      ...this.snapshot,
      telegramSetupSessions: [...this.telegramSetupSessions.values()].map(cloneTelegramSetupSession),
    };
  }
}

export function createMockAgentRuntime(runtimeInfo?: AgentRuntimeInfo): AgentRuntime {
  const service = new MockAgentService(runtimeInfo);

  return {
    getSnapshot: () => service.getSnapshot(),
    reset: () => service.reset(),
    service,
    subscribe: (listener) => service.subscribe(listener),
  };
}
