// Agent runtime record builders and normalization helpers.

import type {
  Agent,
  AgentDefinition,
  AgentExternalTarget,
  AgentMessage,
  AgentTranscriptSummary,
  CreateAgentInput,
  TelegramAgentRuntimeState,
} from '@/renderer/features/agents/types';
import {
  cloneAgentDefinition,
  normalizeAgentDefinition,
} from '@/renderer/features/agents/model/agent-definition';
import {
  cloneTelegramAgentRuntimeState,
  createDefaultTelegramAgentRuntimeState,
} from '@/renderer/features/agents/model/channels';
import { summarizeMessagePreview } from '@/shared/agents/message-content';
import { normalizeProjectRootPath } from '@/shared/workflow/project-artifacts';

import { normalizeAgentAttachments } from '../agent-message-attachments';

import { createChannelBinding } from './channels';
import { createGroupFolder } from './utils';

/** Persisted agent record shape. */
export interface PersistedTranscriptArchive {
  lastCompactedAt: number | null;
  messages: AgentMessage[];
  rollingSummary: string | null;
}

/** Persisted agent record shape. */
export interface PersistedAgentRecord {
  agent: Agent;
  groupFolder: string;
  projectName?: string | null;
  projectRootPath?: string | null;
  transcriptArchive?: PersistedTranscriptArchive | null;
}

function asNonNegativeInteger(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return null;
  }

  return Math.trunc(value);
}

function asFiniteNumber(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return undefined;
  }

  return value;
}

function normalizeAgentMessageUsage(usage: unknown): AgentMessage['usage'] {
  if (!usage || typeof usage !== 'object') {
    return undefined;
  }

  const usageRecord = usage as Record<string, unknown>;
  const inputTokens = asNonNegativeInteger(usageRecord.inputTokens);
  const outputTokens = asNonNegativeInteger(usageRecord.outputTokens);
  const sessionInputTotal = asNonNegativeInteger(usageRecord.sessionInputTotal);
  const sessionOutputTotal = asNonNegativeInteger(usageRecord.sessionOutputTotal);

  if (
    inputTokens === null
    || outputTokens === null
    || sessionInputTotal === null
    || sessionOutputTotal === null
  ) {
    return undefined;
  }

  const costUsd = asFiniteNumber(usageRecord.costUsd);

  return {
    ...(costUsd === undefined ? {} : { costUsd }),
    inputTokens,
    outputTokens,
    sessionInputTotal,
    sessionOutputTotal,
  };
}

/** Creates transcript summary. */
export function createAgentTranscriptSummary(
  input: Partial<AgentTranscriptSummary> = {},
): AgentTranscriptSummary {
  return {
    archivedMessageCount: input.archivedMessageCount ?? 0,
    hasOlderMessages: input.hasOlderMessages ?? false,
    rollingSummary: input.rollingSummary ?? null,
    totalMessageCount: input.totalMessageCount ?? 0,
  };
}

/** Creates transcript archive. */
export function createPersistedTranscriptArchive(
  input: Partial<PersistedTranscriptArchive> = {},
): PersistedTranscriptArchive {
  return {
    lastCompactedAt: input.lastCompactedAt ?? null,
    messages: Array.isArray(input.messages) ? input.messages : [],
    rollingSummary: input.rollingSummary ?? null,
  };
}

/** Normalizes persisted messages. */
export function normalizePersistedMessages(
  messages: AgentMessage[],
  options: { groupFolder: string; runtimeRoot: string },
): AgentMessage[] {
  const persistedMessages = Array.isArray(messages) ? messages : [];
  const lastPersistedMessage = persistedMessages.at(-1);
  const normalizedMessages = persistedMessages.map((message) => {
    const usage = normalizeAgentMessageUsage(message.usage);

    return {
      ...message,
      attachments: normalizeAgentAttachments(message.attachments, options),
      format: (message.format === 'markdown' ? 'markdown' : 'plain') as AgentMessage['format'],
      status: message.status === 'streaming' ? 'complete' : message.status,
      ...(usage ? { usage } : {}),
    };
  });

  if (
    lastPersistedMessage?.role === 'assistant'
    && lastPersistedMessage.content === ''
    && lastPersistedMessage.status === 'streaming'
  ) {
    normalizedMessages.pop();
  }

  return normalizedMessages;
}

/** Creates message ID. */
export function createMessageId(role: AgentMessage['role'], now: number): string {
  return `message-${role}-${now}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Summarizes preview. */
export function summarizePreview(content: string): string {
  return summarizeMessagePreview(content);
}

/** Creates built in agent copy. */
export function createBuiltInAgentCopy() {
  return {
    note: 'This agent is running inside the real AgentLite foundation that Dune now hosts directly in the desktop runtime.',
    preview: 'Ready for a first instruction.',
  };
}

/** Creates external agent copy. */
export function createExternalAgentCopy(attachedLabel: string) {
  return {
    note: `This agent is bound to ${attachedLabel} and mirrors its transcript through the Dune host.`,
    preview: `Attached to ${attachedLabel}. Dune mirrors the transcript.`,
  };
}

/** Creates draft agent. */
export function createDraftAgent(
  agentId: string,
  name: string,
  now: number,
  channelId: CreateAgentInput['channelId'],
  telegramState: TelegramAgentRuntimeState | null,
  externalTarget: AgentExternalTarget | null,
  projectId: string,
  definition: AgentDefinition,
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
    definition: cloneAgentDefinition(definition),
    id: agentId,
    messages: [] satisfies AgentMessage[],
    name,
    note: copy.note,
    preview: copy.preview,
    projectId,
    status: 'draft',
    telegram: channelId === 'telegram'
      ? telegramState ?? createDefaultTelegramAgentRuntimeState({ boundChat: externalTarget })
      : null,
    transcript: createAgentTranscriptSummary(),
    updatedAt: now,
    workspace: 'AgentLite agent',
  };
}

/** Creates user message. */
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

/** Creates assistant message. */
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

/** Normalizes persisted agent record. */
export function normalizePersistedAgentRecord(
  record: PersistedAgentRecord,
  runtimeRoot: string,
): PersistedAgentRecord {
  const groupFolder = record.groupFolder || createGroupFolder(record.agent.name, record.agent.id);
  const legacyRole = (record.agent as unknown as { role?: unknown }).role;
  const fallbackArchetype = legacyRole === 'project-main' ? 'project-main' : 'custom';
  const definition = normalizeAgentDefinition(record.agent.definition, fallbackArchetype);

  const transcriptArchive = createPersistedTranscriptArchive(record.transcriptArchive ?? {});
  const normalizedArchiveMessages = normalizePersistedMessages(transcriptArchive.messages, {
    groupFolder,
    runtimeRoot,
  });
  const normalizedLiveMessages = normalizePersistedMessages(record.agent.messages, {
    groupFolder,
    runtimeRoot,
  });
  const totalMessageCount = normalizedArchiveMessages.length + normalizedLiveMessages.length;

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
      definition,
      messages: normalizedLiveMessages,
      projectId: typeof record.agent.projectId === 'string' ? record.agent.projectId : null,
      status: record.agent.status === 'live' ? 'ready' : record.agent.status,
      telegram: cloneTelegramAgentRuntimeState(record.agent.telegram),
      transcript: createAgentTranscriptSummary({
        archivedMessageCount: normalizedArchiveMessages.length,
        hasOlderMessages: totalMessageCount > normalizedLiveMessages.length,
        rollingSummary: transcriptArchive.rollingSummary,
        totalMessageCount,
      }),
    },
    groupFolder,
    projectName: typeof record.projectName === 'string' && record.projectName.trim()
      ? record.projectName.trim()
      : null,
    projectRootPath: normalizeProjectRootPath(record.projectRootPath),
    transcriptArchive: {
      ...transcriptArchive,
      messages: normalizedArchiveMessages,
    },
  };
}
