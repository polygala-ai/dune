// Compatibility tables for aggregate snapshot shapes during migration.

import { sqliteTable, text } from 'drizzle-orm/sqlite-core';

import type { PersistedAgentRecord } from '@/electron/main/runtime/agent-runtime/records';
import type { WorkflowSnapshot } from '@/renderer/features/workflow/types';

import { GLOBAL_STATE_ROW_ID } from './constants';

/** Compatibility view of the currently persisted workflow snapshot shape. */
export const workflowSnapshots = sqliteTable('workflow_snapshots', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => GLOBAL_STATE_ROW_ID),
  snapshot: text('snapshot', { mode: 'json' }).$type<WorkflowSnapshot>().notNull(),
});

/** Compatibility view of the currently persisted agent state shape. */
export const agentStateSnapshots = sqliteTable('agent_state_snapshots', {
  agents: text('agents', { mode: 'json' }).$type<PersistedAgentRecord[]>().notNull(),
  id: text('id')
    .primaryKey()
    .$defaultFn(() => GLOBAL_STATE_ROW_ID),
  selectedAgentId: text('selected_agent_id'),
});

export type WorkflowSnapshotRow = typeof workflowSnapshots.$inferSelect;
export type NewWorkflowSnapshotRow = typeof workflowSnapshots.$inferInsert;
export type AgentStateSnapshotRow = typeof agentStateSnapshots.$inferSelect;
export type NewAgentStateSnapshotRow = typeof agentStateSnapshots.$inferInsert;
