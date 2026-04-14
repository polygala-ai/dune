import type {
  Agent,
  AgentExternalTarget,
  AgentMessage,
  AgentRole,
  CreateAgentInput,
  TelegramAgentRuntimeState,
} from '@/renderer/features/agents/types';
import {
  cloneTelegramAgentRuntimeState,
  createDefaultTelegramAgentRuntimeState,
} from '@/renderer/features/agents/model/channels';
import { summarizeMessagePreview } from '@/shared/agents/message-content';
import { normalizeProjectRootPath } from '@/shared/workflow/project-artifacts';

import { normalizeAgentAttachments } from '../agent-message-attachments';

import { createChannelBinding } from './channels';
import { createGroupFolder } from './utils';

export interface PersistedAgentRecord {
  agent: Agent;
  groupFolder: string;
  projectName?: string | null;
  projectRootPath?: string | null;
}

export function normalizePersistedMessages(
  messages: AgentMessage[],
  options: { groupFolder: string; runtimeRoot: string },
): AgentMessage[] {
  const persistedMessages = Array.isArray(messages) ? messages : [];
  const lastPersistedMessage = persistedMessages.at(-1);
  const normalizedMessages = persistedMessages.map((message) => ({
    ...message,
    attachments: normalizeAgentAttachments(message.attachments, options),
    format: (message.format === 'markdown' ? 'markdown' : 'plain') as AgentMessage['format'],
    status: message.status === 'streaming' ? 'complete' : message.status,
  }));

  if (
    lastPersistedMessage?.role === 'assistant'
    && lastPersistedMessage.content === ''
    && lastPersistedMessage.status === 'streaming'
  ) {
    normalizedMessages.pop();
  }

  return normalizedMessages;
}

export function createMessageId(role: AgentMessage['role'], now: number): string {
  return `message-${role}-${now}-${Math.random().toString(36).slice(2, 8)}`;
}

export function summarizePreview(content: string): string {
  return summarizeMessagePreview(content);
}

export function createBuiltInAgentCopy() {
  return {
    note: 'This agent is running inside the real AgentLite foundation that Dune now hosts directly in the desktop runtime.',
    preview: 'Ready for a first instruction.',
  };
}

export function createExternalAgentCopy(attachedLabel: string) {
  return {
    note: `This agent is bound to ${attachedLabel} and mirrors its transcript through the Dune host.`,
    preview: `Attached to ${attachedLabel}. Dune mirrors the transcript.`,
  };
}

export function createDraftAgent(
  agentId: string,
  name: string,
  now: number,
  channelId: CreateAgentInput['channelId'],
  telegramState: TelegramAgentRuntimeState | null,
  externalTarget: AgentExternalTarget | null,
  projectId: string,
  role: AgentRole,
): Agent {
  const channel = createChannelBinding(channelId, telegramState, externalTarget);
  const attachedLabel = channel.target?.name ?? channel.label;
  const copy = channel.kind === 'built-in'
    ? createBuiltInAgentCopy()
    : createExternalAgentCopy(attachedLabel);

  return {
    channel,
    activityEvents: [],
    codingEngineEvents: [],
    contextCards: [],
    id: agentId,
    messages: [] satisfies AgentMessage[],
    name,
    note: copy.note,
    preview: copy.preview,
    projectId,
    role,
    status: 'draft',
    telegram: channelId === 'telegram'
      ? telegramState ?? createDefaultTelegramAgentRuntimeState({ boundChat: externalTarget })
      : null,
    updatedAt: now,
    workspace: 'AgentLite agent',
  };
}

export function createUserMessage(content: string, now: number): AgentMessage {
  return {
    attachments: [],
    content,
    createdAt: now,
    format: 'plain',
    id: createMessageId('user', now),
    role: 'user',
    status: 'complete',
  };
}

export function createAssistantMessage(now: number): AgentMessage {
  return {
    attachments: [],
    content: '',
    createdAt: now,
    format: 'markdown',
    id: createMessageId('assistant', now),
    role: 'assistant',
    status: 'streaming',
  };
}

export function normalizePersistedAgentRecord(
  record: PersistedAgentRecord,
  runtimeRoot: string,
): PersistedAgentRecord {
  const groupFolder = record.groupFolder || createGroupFolder(record.agent.name, record.agent.id);

  return {
    agent: {
      ...record.agent,
      activityEvents: Array.isArray(record.agent.activityEvents)
        ? record.agent.activityEvents.map((event) => ({ ...event }))
        : [],
      channel: {
        ...record.agent.channel,
        target: record.agent.channel.target ? { ...record.agent.channel.target } : null,
      },
      codingEngineEvents: Array.isArray(record.agent.codingEngineEvents)
        ? record.agent.codingEngineEvents.map((event) => ({ ...event }))
        : [],
      contextCards: record.agent.contextCards.map((card) => ({ ...card })),
      messages: normalizePersistedMessages(record.agent.messages, {
        groupFolder,
        runtimeRoot,
      }),
      projectId: typeof record.agent.projectId === 'string' ? record.agent.projectId : null,
      role: record.agent.role === 'project-main' ? 'project-main' : 'custom',
      status: record.agent.status === 'live' ? 'ready' : record.agent.status,
      telegram: cloneTelegramAgentRuntimeState(record.agent.telegram),
    },
    groupFolder,
    projectName: typeof record.projectName === 'string' && record.projectName.trim()
      ? record.projectName.trim()
      : null,
    projectRootPath: normalizeProjectRootPath(record.projectRootPath),
  };
}
