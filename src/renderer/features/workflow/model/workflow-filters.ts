// Workflow board filter helpers.

import type {
  WorkflowItem,
  WorkflowItemStatus,
} from '@/renderer/features/workflow/types';

/** Reviewer feedback filter value. */
export type ReviewerFilter = 'all' | 'has' | 'none';

/** Workflow board filter state. */
export interface WorkflowItemFilters {
  agentId: 'all' | 'unassigned' | string;
  dateFrom: string;
  dateTo: string;
  reviewer: ReviewerFilter;
  status: 'all' | WorkflowItemStatus;
}

/** Default workflow board filters. */
export const defaultWorkflowItemFilters: WorkflowItemFilters = {
  agentId: 'all',
  dateFrom: '',
  dateTo: '',
  reviewer: 'all',
  status: 'all',
};

/** Checks whether filter state is default. */
export function hasActiveWorkflowItemFilters(filters: WorkflowItemFilters) {
  return (
    filters.agentId !== defaultWorkflowItemFilters.agentId ||
    filters.dateFrom !== defaultWorkflowItemFilters.dateFrom ||
    filters.dateTo !== defaultWorkflowItemFilters.dateTo ||
    filters.reviewer !== defaultWorkflowItemFilters.reviewer ||
    filters.status !== defaultWorkflowItemFilters.status
  );
}

/** Converts yyyy-mm-dd input to day boundary timestamp. */
function parseDateInput(value: string, boundary: 'end' | 'start') {
  if (!value) {
    return null;
  }

  const date = new Date(`${value}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  if (boundary === 'end') {
    date.setHours(23, 59, 59, 999);
  }

  return date.getTime();
}

/** Returns whether an item has reviewer feedback. */
function hasReviewerFeedback(item: WorkflowItem) {
  return item.workflowEvents.some((event) => event.kind === 'feedback');
}

/** Applies combinable workflow item filters. */
export function filterWorkflowItems(
  items: WorkflowItem[],
  filters: WorkflowItemFilters,
) {
  const fromTimestamp = parseDateInput(filters.dateFrom, 'start');
  const toTimestamp = parseDateInput(filters.dateTo, 'end');

  return items.filter((item) => {
    if (filters.status !== 'all' && item.status !== filters.status) {
      return false;
    }

    if (filters.agentId === 'unassigned' && item.primaryAgentId) {
      return false;
    }

    if (
      filters.agentId !== 'all' &&
      filters.agentId !== 'unassigned' &&
      item.primaryAgentId !== filters.agentId
    ) {
      return false;
    }

    if (fromTimestamp !== null && item.updatedAt < fromTimestamp) {
      return false;
    }

    if (toTimestamp !== null && item.updatedAt > toTimestamp) {
      return false;
    }

    if (filters.reviewer === 'has' && !hasReviewerFeedback(item)) {
      return false;
    }

    if (filters.reviewer === 'none' && hasReviewerFeedback(item)) {
      return false;
    }

    return true;
  });
}
