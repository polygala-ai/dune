// Local in-memory search and filter helpers for workflow items.

import type { Agent } from '@/renderer/features/agents/types';
import {
  formatWorkflowItemStatus,
} from '@/renderer/features/workflow/model/workflow-presenters';
import type {
  WorkflowItem,
  WorkflowItemStatus,
} from '@/renderer/features/workflow/types';

/** Reviewer filter mode. */
export type ReviewerFilter = 'all' | 'has' | 'none';

/** Work item filter state. */
export interface WorkItemFilters {
  agentId: string;
  dateFrom: string;
  dateTo: string;
  reviewer: ReviewerFilter;
  statuses: WorkflowItemStatus[];
}

/** Search result shape. */
export interface WorkItemSearchResult {
  assignee: string;
  id: string;
  projectId: string;
  score: number;
  snippet: string;
  status: WorkflowItemStatus;
  statusLabel: string;
  title: string;
}

interface SearchRecord {
  assignee: string;
  chunks: string[];
  haystack: string;
  item: WorkflowItem;
}

const defaultSnippetLength = 132;

/** Creates empty work item filters. */
export function createDefaultWorkItemFilters(): WorkItemFilters {
  return {
    agentId: 'all',
    dateFrom: '',
    dateTo: '',
    reviewer: 'all',
    statuses: [],
  };
}

/** Returns whether an item has review ownership or is in review flow. */
export function hasReviewerSignal(item: WorkflowItem) {
  return (
    item.status === 'review' ||
    item.status === 'acceptance' ||
    item.tasks.some((task) => task.status === 'review')
  );
}

/** Returns true when filters are not narrowed. */
export function areWorkItemFiltersEmpty(filters: WorkItemFilters) {
  return (
    filters.statuses.length === 0 &&
    filters.agentId === 'all' &&
    filters.dateFrom === '' &&
    filters.dateTo === '' &&
    filters.reviewer === 'all'
  );
}

function normalize(value: string) {
  return value.toLocaleLowerCase().replace(/\s+/g, ' ').trim();
}

function getDateTimestamp(value: string, endOfDay: boolean) {
  if (!value) {
    return null;
  }

  const timestamp = new Date(`${value}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}`).getTime();

  return Number.isNaN(timestamp) ? null : timestamp;
}

function matchesFilters(item: WorkflowItem, filters: WorkItemFilters) {
  if (filters.statuses.length > 0 && !filters.statuses.includes(item.status)) {
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

  const fromTimestamp = getDateTimestamp(filters.dateFrom, false);
  const toTimestamp = getDateTimestamp(filters.dateTo, true);

  if (fromTimestamp !== null && item.updatedAt < fromTimestamp) {
    return false;
  }

  if (toTimestamp !== null && item.updatedAt > toTimestamp) {
    return false;
  }

  if (filters.reviewer === 'has' && !hasReviewerSignal(item)) {
    return false;
  }

  if (filters.reviewer === 'none' && hasReviewerSignal(item)) {
    return false;
  }

  return true;
}

function createSnippet(chunks: string[], query: string) {
  const normalizedQuery = normalize(query);
  const matchChunk =
    chunks.find((chunk) => normalize(chunk).includes(normalizedQuery)) ??
    chunks.find((chunk) => chunk.trim().length > 0) ??
    '';
  const compactChunk = matchChunk.replace(/\s+/g, ' ').trim();

  if (compactChunk.length <= defaultSnippetLength) {
    return compactChunk || 'No matching text available.';
  }

  const matchIndex = normalize(compactChunk).indexOf(normalizedQuery);
  const start = Math.max(0, matchIndex - 36);
  const end = Math.min(compactChunk.length, start + defaultSnippetLength);
  const prefix = start > 0 ? '…' : '';
  const suffix = end < compactChunk.length ? '…' : '';

  return `${prefix}${compactChunk.slice(start, end).trim()}${suffix}`;
}

function scoreRecord(record: SearchRecord, query: string) {
  const normalizedQuery = normalize(query);

  if (!normalizedQuery) {
    return 1;
  }

  const title = normalize(record.item.title);
  const brief = normalize(record.item.brief);

  if (title === normalizedQuery) {
    return 120;
  }

  if (title.includes(normalizedQuery)) {
    return 90;
  }

  if (brief.includes(normalizedQuery)) {
    return 65;
  }

  if (record.haystack.includes(normalizedQuery)) {
    return 45;
  }

  const tokens = normalizedQuery.split(' ').filter(Boolean);
  const matchedTokens = tokens.filter((token) => record.haystack.includes(token));

  if (tokens.length > 0 && matchedTokens.length === tokens.length) {
    return 25 + matchedTokens.length;
  }

  return 0;
}

/** Filters work items without running text search. */
export function filterWorkflowItems(items: WorkflowItem[], filters: WorkItemFilters) {
  return items.filter((item) => matchesFilters(item, filters));
}

/** In-memory workflow item search index. */
export class SearchIndex {
  private readonly records: SearchRecord[];

  constructor(items: WorkflowItem[], agents: Agent[]) {
    const agentsById = new Map(agents.map((agent) => [agent.id, agent] as const));

    this.records = items.map((item) => {
      const assignee = item.primaryAgentId
        ? agentsById.get(item.primaryAgentId)?.name ?? 'Unknown agent'
        : 'Unassigned';
      const chunks = [
        item.title,
        item.brief,
        ...item.workProducts.flatMap((product) => [product.title, product.body]),
      ];

      return {
        assignee,
        chunks,
        haystack: normalize(chunks.join(' ')),
        item,
      };
    });
  }

  /** Searches indexed items with optional combinable filters. */
  search(query: string, filters: WorkItemFilters = createDefaultWorkItemFilters()) {
    return this.records
      .flatMap((record): WorkItemSearchResult[] => {
        if (!matchesFilters(record.item, filters)) {
          return [];
        }

        const score = scoreRecord(record, query);

        if (score <= 0) {
          return [];
        }

        return [{
          assignee: record.assignee,
          id: record.item.id,
          projectId: record.item.projectId,
          score,
          snippet: createSnippet(record.chunks, query),
          status: record.item.status,
          statusLabel: formatWorkflowItemStatus(record.item.status),
          title: record.item.title,
        }];
      })
      .sort((left, right) =>
        right.score === left.score
          ? left.title.localeCompare(right.title)
          : right.score - left.score,
      );
  }
}
