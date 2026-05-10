// Drizzle-backed workflow snapshot persistence.

import { eq, notInArray } from 'drizzle-orm';

import type { DuneDatabase } from '@/electron/main/db';
import {
  GLOBAL_STATE_ROW_ID,
  workflowEvents,
  workflowItemActivityArchives,
  workflowItems,
  workflowProjects,
  workflowTasks,
  workflowUiState,
  workflowWorkProducts,
} from '@/electron/main/orm';
import type {
  WorkflowEvent,
  WorkflowItem,
  WorkflowProjectFilter,
  WorkflowProjectView,
  WorkflowSnapshot,
  WorkflowTask,
  WorkflowWorkProduct,
} from '@/renderer/features/workflow/types';
import {
  createPersistedWorkflowItemActivityArchive,
  type PersistedWorkflowItemActivityArchive,
} from '@/shared/workflow/activity';

const DEFAULT_PROJECT_FILTER: WorkflowProjectFilter = 'all';
const DEFAULT_PROJECT_VIEW: WorkflowProjectView = 'board';

/** Workflow persistence contract consumed by UI, runtime, and agent actions. */
export interface WorkflowSnapshotStore {
  deleteActivityArchive(itemId: string): Promise<void>;
  deleteActivityArchivesExcept(activeItemIds: Set<string>): Promise<void>;
  readActivityArchive(itemId: string): Promise<PersistedWorkflowItemActivityArchive>;
  readSnapshot(): Promise<WorkflowSnapshot | null>;
  writeActivityArchive(itemId: string, archive: PersistedWorkflowItemActivityArchive): Promise<void>;
  writeSnapshot(snapshot: WorkflowSnapshot): Promise<void>;
}

function groupBy<T, K extends string>(
  rows: T[],
  resolveKey: (row: T) => K,
): Map<K, T[]> {
  const grouped = new Map<K, T[]>();

  for (const row of rows) {
    const key = resolveKey(row);
    const group = grouped.get(key) ?? [];
    group.push(row);
    grouped.set(key, group);
  }

  return grouped;
}

/** Drizzle implementation for workflow persistence. */
export class DrizzleWorkflowRepository implements WorkflowSnapshotStore {
  constructor(private readonly db: DuneDatabase) {}

  readSnapshot(): Promise<WorkflowSnapshot | null> {
    const projectRows = this.db.select().from(workflowProjects).all();
    const itemRows = this.db.select().from(workflowItems).all();
    const uiRow = this.db
      .select()
      .from(workflowUiState)
      .where(eq(workflowUiState.id, GLOBAL_STATE_ROW_ID))
      .get();

    if (!uiRow && projectRows.length === 0 && itemRows.length === 0) {
      return Promise.resolve(null);
    }

    const taskRowsByItem = groupBy(
      this.db.select().from(workflowTasks).all(),
      (row) => row.itemId,
    );
    const workProductRowsByItem = groupBy(
      this.db.select().from(workflowWorkProducts).all(),
      (row) => row.itemId,
    );
    const eventRowsByItem = groupBy(
      this.db.select().from(workflowEvents).all(),
      (row) => row.itemId,
    );

    const projects = projectRows
      .map((project) => ({ ...project }))
      .sort((left, right) => left.createdAt - right.createdAt);
    const items = itemRows
      .map((item): WorkflowItem => ({
        ...item,
        tasks: (taskRowsByItem.get(item.id) ?? [])
          .map((task): WorkflowTask => ({ ...task }))
          .sort((left, right) => left.createdAt - right.createdAt),
        workProducts: (workProductRowsByItem.get(item.id) ?? [])
          .map((workProduct): WorkflowWorkProduct => ({ ...workProduct }))
          .sort((left, right) => right.createdAt - left.createdAt),
        workflowEvents: (eventRowsByItem.get(item.id) ?? [])
          .map((event): WorkflowEvent => ({
            ...(event.actor ? { actor: event.actor } : {}),
            createdAt: event.createdAt,
            description: event.description,
            id: event.id,
            kind: event.kind,
          }))
          .sort((left, right) => right.createdAt - left.createdAt),
      }))
      .sort((left, right) => {
        if (left.projectId !== right.projectId) {
          return left.projectId.localeCompare(right.projectId);
        }
        if (left.status !== right.status) {
          return left.status.localeCompare(right.status);
        }
        return left.sortOrder - right.sortOrder;
      });

    return Promise.resolve({
      items,
      projects,
      selectedItemId: uiRow?.selectedItemId ?? null,
      selectedProjectFilter: uiRow?.selectedProjectFilter ?? DEFAULT_PROJECT_FILTER,
      selectedProjectId: uiRow?.selectedProjectId ?? projects[0]?.id ?? null,
      selectedProjectView: uiRow?.selectedProjectView ?? DEFAULT_PROJECT_VIEW,
    });
  }

  writeSnapshot(snapshot: WorkflowSnapshot): Promise<void> {
    this.db.transaction((tx) => {
      const nextItemIds = new Set(snapshot.items.map((item) => item.id));
      const archiveRows = tx
        .select()
        .from(workflowItemActivityArchives)
        .all()
        .filter((archive) => nextItemIds.has(archive.itemId));

      tx.delete(workflowEvents).run();
      tx.delete(workflowWorkProducts).run();
      tx.delete(workflowTasks).run();
      tx.delete(workflowItemActivityArchives).run();
      tx.delete(workflowItems).run();
      tx.delete(workflowProjects).run();
      tx.delete(workflowUiState).run();

      if (snapshot.projects.length > 0) {
        tx.insert(workflowProjects).values(snapshot.projects).run();
      }

      if (snapshot.items.length > 0) {
        tx.insert(workflowItems).values(snapshot.items.map((item) => ({
          activity: item.activity,
          artifactFolderName: item.artifactFolderName,
          brief: item.brief,
          createdAt: item.createdAt,
          id: item.id,
          primaryAgentId: item.primaryAgentId,
          projectId: item.projectId,
          scheduledTaskId: item.scheduledTaskId,
          sortOrder: item.sortOrder,
          status: item.status,
          title: item.title,
          updatedAt: item.updatedAt,
        }))).run();
      }

      const taskRows = snapshot.items.flatMap((item) =>
        item.tasks.map((task) => ({
          ...task,
          itemId: item.id,
        })));
      const workProductRows = snapshot.items.flatMap((item) =>
        item.workProducts.map((workProduct) => ({
          ...workProduct,
          itemId: item.id,
        })));
      const eventRows = snapshot.items.flatMap((item) =>
        item.workflowEvents.map((event) => ({
          actor: event.actor ?? null,
          createdAt: event.createdAt,
          description: event.description,
          id: event.id,
          itemId: item.id,
          kind: event.kind,
        })));

      if (taskRows.length > 0) {
        tx.insert(workflowTasks).values(taskRows).run();
      }
      if (workProductRows.length > 0) {
        tx.insert(workflowWorkProducts).values(workProductRows).run();
      }
      if (eventRows.length > 0) {
        tx.insert(workflowEvents).values(eventRows).run();
      }
      if (archiveRows.length > 0) {
        tx.insert(workflowItemActivityArchives).values(archiveRows).run();
      }

      tx.insert(workflowUiState).values({
        id: GLOBAL_STATE_ROW_ID,
        selectedItemId: snapshot.selectedItemId,
        selectedProjectFilter: snapshot.selectedProjectFilter,
        selectedProjectId: snapshot.selectedProjectId,
        selectedProjectView: snapshot.selectedProjectView,
      }).run();
    });

    return Promise.resolve();
  }

  readActivityArchive(itemId: string): Promise<PersistedWorkflowItemActivityArchive> {
    const row = this.db
      .select()
      .from(workflowItemActivityArchives)
      .where(eq(workflowItemActivityArchives.itemId, itemId))
      .get();

    return Promise.resolve(createPersistedWorkflowItemActivityArchive(row ?? {}));
  }

  writeActivityArchive(
    itemId: string,
    archive: PersistedWorkflowItemActivityArchive,
  ): Promise<void> {
    this.db
      .insert(workflowItemActivityArchives)
      .values({
        events: archive.events,
        itemId,
        lastCompactedAt: archive.lastCompactedAt,
        rollingSummary: archive.rollingSummary,
      })
      .onConflictDoUpdate({
        set: {
          events: archive.events,
          lastCompactedAt: archive.lastCompactedAt,
          rollingSummary: archive.rollingSummary,
        },
        target: workflowItemActivityArchives.itemId,
      })
      .run();

    return Promise.resolve();
  }

  deleteActivityArchive(itemId: string): Promise<void> {
    this.db
      .delete(workflowItemActivityArchives)
      .where(eq(workflowItemActivityArchives.itemId, itemId))
      .run();

    return Promise.resolve();
  }

  deleteActivityArchivesExcept(activeItemIds: Set<string>): Promise<void> {
    if (activeItemIds.size === 0) {
      this.db.delete(workflowItemActivityArchives).run();
      return Promise.resolve();
    }

    this.db
      .delete(workflowItemActivityArchives)
      .where(notInArray(workflowItemActivityArchives.itemId, [...activeItemIds]))
      .run();

    return Promise.resolve();
  }
}
