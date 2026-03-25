import type {
  AgentService,
  AgentServiceListener,
  AgentServiceSnapshot,
} from '@/renderer/features/agents/model/agent-service';
import type {
  Agent,
  AgentMessage,
  CreateAgentInput,
} from '@/renderer/features/agents/types';
import { createChannelBinding } from '@/renderer/features/agents/model/channels';

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
  return content.replace(/\s+/g, ' ').trim().slice(0, 92);
}

function createDraftAgent(
  name: string,
  now: number,
  channelId: CreateAgentInput['channelId'],
): Agent {
  const channel = createChannelBinding(channelId);
  const isBuiltInChannel = channel.kind === 'built-in';

  return {
    channel,
    id: createAgentId(name, now),
    name,
    note:
      isBuiltInChannel
        ? 'This prototype agent stays inside Dune while the app is open. AgentLite runtime wiring lands in the next phase.'
        : `This prototype agent mirrors ${channel.label} into Dune. Real channel wiring lands in the AgentLite phase.`,
    preview: isBuiltInChannel
      ? 'Ready for a first instruction.'
      : `Attached to ${channel.label}. Dune mirrors the transcript.`,
    updatedAt: now,
    status: 'draft',
    workspace: 'Prototype agent',
    contextCards: [
      {
        id: `context-${now}-1`,
        eyebrow: 'Connection',
        title: isBuiltInChannel
          ? 'Dune chat is attached by default'
          : `${channel.label} is attached to this agent`,
        body: isBuiltInChannel
          ? 'Dune chat is built in and writable here, so the agent behaves like a long-lived workspace inside the app.'
          : 'This UI-first phase can already present a wrapped external channel, but the actual transport is still mocked.',
      },
      {
        id: `context-${now}-2`,
        eyebrow: 'Phase one',
        title: 'UI first, runtime next',
        body: 'Responses are still mocked in this phase, but the shell is shaped to match the AgentLite model that will replace them.',
      },
    ],
    messages: [],
  };
}

function createUserMessage(content: string, now: number): AgentMessage {
  return {
    id: createMessageId('user', now),
    role: 'user',
    content,
    createdAt: now,
    status: 'complete',
  };
}

function createAssistantMessage(now: number): AgentMessage {
  return {
    id: createMessageId('assistant', now),
    role: 'assistant',
    content: '',
    createdAt: now,
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
      channel: { ...agent.channel },
      contextCards: agent.contextCards.map((card) => ({ ...card })),
      messages: agent.messages.map((message) => ({ ...message })),
    })),
    isStreaming: snapshot.isStreaming,
    selectedAgentId: snapshot.selectedAgentId,
  };
}

export interface AgentRuntime {
  getSnapshot: () => AgentServiceSnapshot;
  reset: () => void;
  service: AgentService;
  subscribe: (listener: AgentServiceListener) => () => void;
}

class MockAgentService implements AgentService {
  private listeners = new Set<AgentServiceListener>();

  private pendingTimers = new Set<number>();

  private snapshot: AgentServiceSnapshot = {
    agents: [],
    isStreaming: false,
    selectedAgentId: null,
  };

  getSnapshot() {
    return cloneSnapshot(this.snapshot);
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

  async createAgent(input: CreateAgentInput) {
    const trimmedName = input.name.trim();

    if (!trimmedName) {
      throw new Error('Agent name is required.');
    }

    const now = Date.now();
    const nextAgent = createDraftAgent(trimmedName, now, input.channelId);

    this.snapshot = {
      ...this.snapshot,
      agents: [nextAgent, ...this.snapshot.agents],
      selectedAgentId: nextAgent.id,
    };
    this.emit();

    return nextAgent.id;
  }

  async sendMessage(agentId: string, text: string) {
    const trimmedText = text.trim();

    if (!trimmedText || this.snapshot.isStreaming) {
      return;
    }

    const agent = this.snapshot.agents.find((item) => item.id === agentId);

    if (!agent || !agent.channel.canCompose) {
      return;
    }

    const now = Date.now();
    const assistantMessage = createAssistantMessage(now);
    const userMessage = createUserMessage(trimmedText, now);

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
      await this.wait(index === 0 ? 120 : 70);
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
      isStreaming: false,
    };
    this.emit();
  }

  reset() {
    for (const timer of this.pendingTimers) {
      window.clearTimeout(timer);
    }

    this.pendingTimers.clear();
    this.snapshot = {
      agents: [],
      isStreaming: false,
      selectedAgentId: null,
    };
    this.emit();
  }

  private emit() {
    const nextSnapshot = this.getSnapshot();

    for (const listener of this.listeners) {
      listener(nextSnapshot);
    }
  }

  private wait(duration: number) {
    return new Promise<void>((resolve) => {
      const timer = window.setTimeout(() => {
        this.pendingTimers.delete(timer);
        resolve();
      }, duration);

      this.pendingTimers.add(timer);
    });
  }
}

export function createMockAgentRuntime(): AgentRuntime {
  const service = new MockAgentService();

  return {
    getSnapshot: () => service.getSnapshot(),
    reset: () => service.reset(),
    service,
    subscribe: (listener) => service.subscribe(listener),
  };
}
