// Agent runtime ORM schema.

import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import type {
  AgentAttachment,
  AgentChannelBinding,
  AgentDefinition,
  AgentMessage,
  AgentMessageUsage,
  AgentStatus,
  AgentTranscriptSummary,
  CodingEngineId,
  MessageFormat,
  MessageRole,
  MessageStatus,
  TelegramAgentRuntimeState,
  TelegramSetupSession,
} from '@/renderer/features/agents/types';
import type { AgentServiceSnapshot } from '@/shared/agents/agent-runtime';

import {
  agentStatuses,
  codingEngineIds,
  GLOBAL_STATE_ROW_ID,
  messageFormats,
  messageRoles,
  messageStatuses,
} from './constants';

/** Agents. */
export const agents = sqliteTable(
  'agents',
  {
    channel: text('channel', { mode: 'json' }).$type<AgentChannelBinding>().notNull(),
    definition: text('definition', { mode: 'json' }).$type<AgentDefinition>().notNull(),
    groupFolder: text('group_folder').notNull(),
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    note: text('note').notNull(),
    preview: text('preview').notNull(),
    projectId: text('project_id'),
    projectName: text('project_name'),
    projectRootPath: text('project_root_path'),
    status: text('status', { enum: agentStatuses }).$type<AgentStatus>().notNull(),
    telegram: text('telegram', { mode: 'json' }).$type<TelegramAgentRuntimeState | null>(),
    transcript: text('transcript', { mode: 'json' }).$type<AgentTranscriptSummary>().notNull(),
    updatedAt: integer('updated_at').notNull().$type<number>(),
    workspace: text('workspace').notNull(),
  },
  (table) => ({
    projectUpdatedIdx: index('agents_project_updated_idx').on(table.projectId, table.updatedAt),
  }),
);

/** Live agent messages. */
export const agentMessages = sqliteTable(
  'agent_messages',
  {
    agentId: text('agent_id')
      .notNull()
      .references(() => agents.id, { onDelete: 'cascade' }),
    attachments: text('attachments', { mode: 'json' }).$type<AgentAttachment[]>().notNull(),
    content: text('content').notNull(),
    createdAt: integer('created_at').notNull().$type<number>(),
    format: text('format', { enum: messageFormats }).$type<MessageFormat>().notNull(),
    id: text('id').primaryKey(),
    role: text('role', { enum: messageRoles }).$type<MessageRole>().notNull(),
    status: text('status', { enum: messageStatuses }).$type<MessageStatus>().notNull(),
    usage: text('usage', { mode: 'json' }).$type<AgentMessageUsage | undefined>(),
  },
  (table) => ({
    agentCreatedIdx: index('agent_messages_agent_created_idx').on(table.agentId, table.createdAt),
  }),
);

/** Agent activity events. */
export const agentActivityEvents = sqliteTable(
  'agent_activity_events',
  {
    agentId: text('agent_id')
      .notNull()
      .references(() => agents.id, { onDelete: 'cascade' }),
    detail: text('detail'),
    id: text('id').primaryKey(),
    kind: text('kind').notNull(),
    label: text('label').notNull(),
    timestamp: integer('timestamp').notNull().$type<number>(),
  },
  (table) => ({
    agentTimestampIdx: index('agent_activity_events_agent_timestamp_idx').on(table.agentId, table.timestamp),
  }),
);

/** Agent context cards. */
export const agentContextCards = sqliteTable(
  'agent_context_cards',
  {
    agentId: text('agent_id')
      .notNull()
      .references(() => agents.id, { onDelete: 'cascade' }),
    body: text('body').notNull(),
    eyebrow: text('eyebrow').notNull(),
    id: text('id').primaryKey(),
    title: text('title').notNull(),
  },
  (table) => ({
    agentIdx: index('agent_context_cards_agent_idx').on(table.agentId),
  }),
);

/** Agent coding engine events. */
export const agentCodingEngineEvents = sqliteTable(
  'agent_coding_engine_events',
  {
    agentId: text('agent_id')
      .notNull()
      .references(() => agents.id, { onDelete: 'cascade' }),
    engineId: text('engine_id', { enum: codingEngineIds }).$type<CodingEngineId>().notNull(),
    error: text('error'),
    id: text('id').primaryKey(),
    kind: text('kind').notNull(),
    prompt: text('prompt'),
    result: text('result'),
    stepLabel: text('step_label'),
    timestamp: integer('timestamp').notNull().$type<number>(),
  },
  (table) => ({
    agentTimestampIdx: index('agent_coding_engine_events_agent_timestamp_idx').on(
      table.agentId,
      table.timestamp,
    ),
  }),
);

/** Archived transcript messages for each agent. */
export const agentTranscriptArchives = sqliteTable('agent_transcript_archives', {
  agentId: text('agent_id')
    .primaryKey()
    .references(() => agents.id, { onDelete: 'cascade' }),
  lastCompactedAt: integer('last_compacted_at').$type<number | null>(),
  messages: text('messages', { mode: 'json' }).$type<AgentMessage[]>().notNull(),
  rollingSummary: text('rolling_summary'),
});

/** Agent UI selection state. */
export const agentUiState = sqliteTable('agent_ui_state', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => GLOBAL_STATE_ROW_ID),
  selectedAgentId: text('selected_agent_id'),
});

/** Telegram setup sessions. */
export const telegramSetupSessions = sqliteTable(
  'telegram_setup_sessions',
  {
    agentId: text('agent_id'),
    botUsername: text('bot_username'),
    errorMessage: text('error_message'),
    id: text('id').primaryKey(),
    matchedChat: text('matched_chat', { mode: 'json' }).$type<TelegramSetupSession['matchedChat']>(),
    pairCode: text('pair_code'),
    pairExpiresAt: integer('pair_expires_at').$type<number | null>(),
    pairingStatus: text('pairing_status').notNull(),
    status: text('status').notNull(),
  },
  (table) => ({
    agentIdx: index('telegram_setup_sessions_agent_idx').on(table.agentId),
  }),
);

/** Coding engine availability cache. */
export const codingEngines = sqliteTable('coding_engines', {
  available: integer('available', { mode: 'boolean' }).notNull(),
  id: text('id', { enum: codingEngineIds }).$type<CodingEngineId>().primaryKey(),
  label: text('label').notNull(),
  version: text('version'),
});

/** Runtime-level snapshot metadata. */
export const runtimeState = sqliteTable('runtime_state', {
  externalChannels: text('external_channels', { mode: 'json' })
    .$type<AgentServiceSnapshot['externalChannels']>()
    .notNull(),
  id: text('id')
    .primaryKey()
    .$defaultFn(() => GLOBAL_STATE_ROW_ID),
  isStreaming: integer('is_streaming', { mode: 'boolean' }).notNull(),
  runtimeInfo: text('runtime_info', { mode: 'json' }).$type<AgentServiceSnapshot['runtimeInfo']>().notNull(),
});

export type AgentRow = typeof agents.$inferSelect;
export type NewAgentRow = typeof agents.$inferInsert;
export type AgentMessageRow = typeof agentMessages.$inferSelect;
export type NewAgentMessageRow = typeof agentMessages.$inferInsert;
export type AgentActivityEventRow = typeof agentActivityEvents.$inferSelect;
export type NewAgentActivityEventRow = typeof agentActivityEvents.$inferInsert;
export type AgentContextCardRow = typeof agentContextCards.$inferSelect;
export type NewAgentContextCardRow = typeof agentContextCards.$inferInsert;
export type AgentCodingEngineEventRow = typeof agentCodingEngineEvents.$inferSelect;
export type NewAgentCodingEngineEventRow = typeof agentCodingEngineEvents.$inferInsert;
export type AgentTranscriptArchiveRow = typeof agentTranscriptArchives.$inferSelect;
export type NewAgentTranscriptArchiveRow = typeof agentTranscriptArchives.$inferInsert;
export type AgentUiStateRow = typeof agentUiState.$inferSelect;
export type NewAgentUiStateRow = typeof agentUiState.$inferInsert;
export type TelegramSetupSessionRow = typeof telegramSetupSessions.$inferSelect;
export type NewTelegramSetupSessionRow = typeof telegramSetupSessions.$inferInsert;
export type CodingEngineRow = typeof codingEngines.$inferSelect;
export type NewCodingEngineRow = typeof codingEngines.$inferInsert;
export type RuntimeStateRow = typeof runtimeState.$inferSelect;
export type NewRuntimeStateRow = typeof runtimeState.$inferInsert;

export type PersistedAgent = AgentRow;
export type PersistedAgentMessage = AgentMessageRow;
export type PersistedAgentActivityEvent = AgentActivityEventRow;
export type PersistedAgentContextCard = AgentContextCardRow;
export type PersistedAgentCodingEngineEvent = AgentCodingEngineEventRow;
export type PersistedAgentTranscriptArchive = AgentTranscriptArchiveRow;
