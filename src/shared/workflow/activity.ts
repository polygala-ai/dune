// Workflow activity compaction helpers.

import type {
  WorkflowItem,
  WorkflowItemActivitySummary,
  WorkflowProjectActivityEntry,
  WorkflowProjectActivitySummary,
} from '@/renderer/features/workflow/types';

export const MAX_LIVE_WORKFLOW_ITEM_ACTIVITY_EVENTS = 24;
export const MAX_WORKFLOW_ACTIVITY_SUMMARY_EVENTS = 12;
export const DEFAULT_WORKFLOW_PROJECT_ACTIVITY_PAGE_LIMIT = 80;
export const MAX_WORKFLOW_PROJECT_ACTIVITY_PAGE_LIMIT = 200;
const WORKFLOW_ITEM_ACTIVITY_ARCHIVE_KEY_PREFIX = 'item-activity-archive:';

interface WorkflowActivityEventLike {
  actor?: string;
  createdAt: number;
  description: string;
  id: string;
  kind: string;
}

/** Persisted workflow item activity archive shape. */
export interface PersistedWorkflowItemActivityArchive {
  events: WorkflowActivityEventLike[];
  lastCompactedAt: number | null;
  rollingSummary: string | null;
}

/** Creates workflow item activity summary. */
export function createWorkflowItemActivitySummary(
  input: Partial<WorkflowItemActivitySummary> = {},
): WorkflowItemActivitySummary {
  return {
    archivedEventCount: input.archivedEventCount ?? 0,
    hasOlderEvents: input.hasOlderEvents ?? false,
    rollingSummary: input.rollingSummary ?? null,
    totalEventCount: input.totalEventCount ?? 0,
  };
}

/** Creates persisted workflow item activity archive. */
export function createPersistedWorkflowItemActivityArchive(
  input: Partial<PersistedWorkflowItemActivityArchive> = {},
): PersistedWorkflowItemActivityArchive {
  return {
    events: Array.isArray(input.events) ? input.events.map((event) => ({ ...event })) : [],
    lastCompactedAt: input.lastCompactedAt ?? null,
    rollingSummary: input.rollingSummary ?? null,
  };
}

/** Creates workflow item activity archive storage key. */
export function createWorkflowItemActivityArchiveKey(itemId: string) {
  return `${WORKFLOW_ITEM_ACTIVITY_ARCHIVE_KEY_PREFIX}${itemId}`;
}

/** Returns whether the key stores workflow item activity archive data. */
export function isWorkflowItemActivityArchiveKey(key: string) {
  return key.startsWith(WORKFLOW_ITEM_ACTIVITY_ARCHIVE_KEY_PREFIX);
}

/** Extracts item id from an activity archive key. */
export function getWorkflowItemActivityArchiveItemId(key: string) {
  return key.startsWith(WORKFLOW_ITEM_ACTIVITY_ARCHIVE_KEY_PREFIX)
    ? key.slice(WORKFLOW_ITEM_ACTIVITY_ARCHIVE_KEY_PREFIX.length)
    : null;
}

/** Clamps workflow activity page limit. */
export function clampWorkflowProjectActivityPageLimit(limit?: number) {
  if (!Number.isFinite(limit)) {
    return DEFAULT_WORKFLOW_PROJECT_ACTIVITY_PAGE_LIMIT;
  }

  return Math.max(
    1,
    Math.min(
      MAX_WORKFLOW_PROJECT_ACTIVITY_PAGE_LIMIT,
      Math.trunc(limit ?? DEFAULT_WORKFLOW_PROJECT_ACTIVITY_PAGE_LIMIT),
    ),
  );
}

/** Builds rolling summary for archived item activity. */
export function buildRollingWorkflowItemActivitySummary(
  itemTitle: string,
  events: WorkflowActivityEventLike[],
) {
  const summarizedEvents = events
    .slice(-MAX_WORKFLOW_ACTIVITY_SUMMARY_EVENTS)
    .map((event) => {
      const actor = event.actor?.trim() || 'Dune';
      return `- ${actor}: ${event.description}`;
    });

  if (summarizedEvents.length === 0) {
    return null;
  }

  return [
    `${events.length} earlier activity events were archived for "${itemTitle}".`,
    'Preserve the milestones, decisions, and unresolved follow-ups captured here.',
    '',
    ...summarizedEvents,
  ].join('\n');
}

/** Creates flattened project activity entry. */
export function createWorkflowProjectActivityEntry(
  item: Pick<WorkflowItem, 'id' | 'title'>,
  event: WorkflowActivityEventLike,
): WorkflowProjectActivityEntry {
  return {
    ...(event.actor ? { actor: event.actor } : {}),
    createdAt: event.createdAt,
    description: event.description,
    id: event.id,
    itemId: item.id,
    itemTitle: item.title,
  };
}

/** Compares project activity entries newest-first. */
export function compareWorkflowProjectActivityEntries(
  left: WorkflowProjectActivityEntry,
  right: WorkflowProjectActivityEntry,
) {
  if (left.createdAt !== right.createdAt) {
    return right.createdAt - left.createdAt;
  }

  return right.id.localeCompare(left.id);
}

/** Reduces isolated item activity summaries into one project summary. */
export function createWorkflowProjectActivitySummary(
  items: WorkflowItem[],
): WorkflowProjectActivitySummary {
  const archivedEntryCount = items.reduce(
    (total, item) => total + item.activity.archivedEventCount,
    0,
  );
  const totalEntryCount = items.reduce(
    (total, item) => total + item.activity.totalEventCount,
    0,
  );
  const isolatedSummaries = items
    .filter((item) => item.activity.rollingSummary?.trim())
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .map((item) => [
      `### ${item.title}`,
      item.activity.rollingSummary?.trim(),
    ].join('\n\n'));

  return {
    archivedEntryCount,
    hasOlderEntries: archivedEntryCount > 0,
    rollingSummary: isolatedSummaries.length > 0
      ? [
          `${archivedEntryCount} earlier project activity entries were reduced from per-item archives.`,
          'Each item was summarized in isolation, then merged here so the project feed stays light.',
          '',
          ...isolatedSummaries,
        ].join('\n\n')
      : null,
    totalEntryCount,
  };
}
