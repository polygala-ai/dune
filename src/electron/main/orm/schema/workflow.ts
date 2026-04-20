// Workflow ORM schema.

import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import type {
  WorkflowEventKind,
  WorkflowItemActivitySummary,
  WorkflowItemStatus,
  WorkflowProjectFilter,
  WorkflowProjectView,
  WorkflowTaskStatus,
} from '@/renderer/features/workflow/types';
import type { PersistedWorkflowItemActivityArchive } from '@/shared/workflow/activity';

import {
  GLOBAL_STATE_ROW_ID,
  workflowEventKinds,
  workflowItemStatuses,
  workflowProjectFilters,
  workflowProjectViews,
  workflowTaskStatuses,
} from './constants';

/** Workflow projects. */
export const workflowProjects = sqliteTable('workflow_projects', {
  color: text('color').notNull(),
  createdAt: integer('created_at').notNull().$type<number>(),
  description: text('description').notNull(),
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  rootPath: text('root_path'),
  updatedAt: integer('updated_at').notNull().$type<number>(),
});

/** Workflow items. */
export const workflowItems = sqliteTable(
  'workflow_items',
  {
    activity: text('activity', { mode: 'json' }).$type<WorkflowItemActivitySummary>().notNull(),
    artifactFolderName: text('artifact_folder_name').notNull(),
    brief: text('brief').notNull(),
    createdAt: integer('created_at').notNull().$type<number>(),
    id: text('id').primaryKey(),
    primaryAgentId: text('primary_agent_id'),
    projectId: text('project_id')
      .notNull()
      .references(() => workflowProjects.id, { onDelete: 'cascade' }),
    scheduledTaskId: text('scheduled_task_id'),
    sortOrder: integer('sort_order').notNull(),
    status: text('status', { enum: workflowItemStatuses }).$type<WorkflowItemStatus>().notNull(),
    title: text('title').notNull(),
    updatedAt: integer('updated_at').notNull().$type<number>(),
  },
  (table) => ({
    primaryAgentIdx: index('workflow_items_primary_agent_idx').on(table.primaryAgentId),
    projectStatusSortIdx: index('workflow_items_project_status_sort_idx').on(
      table.projectId,
      table.status,
      table.sortOrder,
    ),
    projectUpdatedIdx: index('workflow_items_project_updated_idx').on(table.projectId, table.updatedAt),
  }),
);

/** Workflow tasks. */
export const workflowTasks = sqliteTable(
  'workflow_tasks',
  {
    createdAt: integer('created_at').notNull().$type<number>(),
    id: text('id').primaryKey(),
    itemId: text('item_id')
      .notNull()
      .references(() => workflowItems.id, { onDelete: 'cascade' }),
    notes: text('notes').notNull(),
    status: text('status', { enum: workflowTaskStatuses }).$type<WorkflowTaskStatus>().notNull(),
    title: text('title').notNull(),
    updatedAt: integer('updated_at').notNull().$type<number>(),
  },
  (table) => ({
    itemUpdatedIdx: index('workflow_tasks_item_updated_idx').on(table.itemId, table.updatedAt),
  }),
);

/** Workflow work products. */
export const workflowWorkProducts = sqliteTable(
  'workflow_work_products',
  {
    body: text('body').notNull(),
    createdAt: integer('created_at').notNull().$type<number>(),
    id: text('id').primaryKey(),
    itemId: text('item_id')
      .notNull()
      .references(() => workflowItems.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
  },
  (table) => ({
    itemCreatedIdx: index('workflow_work_products_item_created_idx').on(table.itemId, table.createdAt),
  }),
);

/** Workflow events. */
export const workflowEvents = sqliteTable(
  'workflow_events',
  {
    actor: text('actor'),
    createdAt: integer('created_at').notNull().$type<number>(),
    description: text('description').notNull(),
    id: text('id').primaryKey(),
    itemId: text('item_id')
      .notNull()
      .references(() => workflowItems.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: workflowEventKinds }).$type<WorkflowEventKind>().notNull(),
  },
  (table) => ({
    itemCreatedIdx: index('workflow_events_item_created_idx').on(table.itemId, table.createdAt),
  }),
);

/** Archived workflow activity per item. */
export const workflowItemActivityArchives = sqliteTable('workflow_item_activity_archives', {
  events: text('events', { mode: 'json' })
    .$type<PersistedWorkflowItemActivityArchive['events']>()
    .notNull(),
  itemId: text('item_id')
    .primaryKey()
    .references(() => workflowItems.id, { onDelete: 'cascade' }),
  lastCompactedAt: integer('last_compacted_at').$type<number | null>(),
  rollingSummary: text('rolling_summary'),
});

/** Workflow UI selection state. */
export const workflowUiState = sqliteTable('workflow_ui_state', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => GLOBAL_STATE_ROW_ID),
  selectedItemId: text('selected_item_id'),
  selectedProjectFilter: text('selected_project_filter', {
    enum: workflowProjectFilters,
  }).$type<WorkflowProjectFilter>().notNull(),
  selectedProjectId: text('selected_project_id'),
  selectedProjectView: text('selected_project_view', {
    enum: workflowProjectViews,
  }).$type<WorkflowProjectView>().notNull(),
});

export type WorkflowProjectRow = typeof workflowProjects.$inferSelect;
export type NewWorkflowProjectRow = typeof workflowProjects.$inferInsert;
export type WorkflowItemRow = typeof workflowItems.$inferSelect;
export type NewWorkflowItemRow = typeof workflowItems.$inferInsert;
export type WorkflowTaskRow = typeof workflowTasks.$inferSelect;
export type NewWorkflowTaskRow = typeof workflowTasks.$inferInsert;
export type WorkflowWorkProductRow = typeof workflowWorkProducts.$inferSelect;
export type NewWorkflowWorkProductRow = typeof workflowWorkProducts.$inferInsert;
export type WorkflowEventRow = typeof workflowEvents.$inferSelect;
export type NewWorkflowEventRow = typeof workflowEvents.$inferInsert;
export type WorkflowItemActivityArchiveRow = typeof workflowItemActivityArchives.$inferSelect;
export type NewWorkflowItemActivityArchiveRow = typeof workflowItemActivityArchives.$inferInsert;
export type WorkflowUiStateRow = typeof workflowUiState.$inferSelect;
export type NewWorkflowUiStateRow = typeof workflowUiState.$inferInsert;

export type PersistedWorkflowProject = WorkflowProjectRow;
export type PersistedWorkflowItem = WorkflowItemRow;
export type PersistedWorkflowTask = WorkflowTaskRow;
export type PersistedWorkflowWorkProduct = WorkflowWorkProductRow;
export type PersistedWorkflowEvent = WorkflowEventRow;
export type PersistedWorkflowUiState = WorkflowUiStateRow;
