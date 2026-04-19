// Workflow work-item search helpers.

import type { Agent } from '@/renderer/features/agents/types';
import { formatWorkflowItemStatus } from '@/renderer/features/workflow/model/workflow-presenters';
import type {
  WorkflowItem,
  WorkflowItemStatus,
  WorkflowProject,
} from '@/renderer/features/workflow/types';

const SEARCH_SNIPPET_WINDOW = 72;

type WorkflowSearchTextBlockKind =
  | 'brief'
  | 'title'
  | 'work-product-body'
  | 'work-product-title';

interface WorkflowSearchTextBlock {
  kind: WorkflowSearchTextBlockKind;
  label: string;
  normalizedText: string;
  text: string;
}

export interface WorkflowSearchIndexEntry {
  blocks: WorkflowSearchTextBlock[];
  createdAt: number;
  id: string;
  indexedText: string;
  primaryAgentId: string | null;
  primaryAgentName: string | null;
  projectId: string;
  projectName: string | null;
  reviewerName: string | null;
  status: WorkflowItemStatus;
  statusLabel: string;
  title: string;
  updatedAt: number;
}

export interface WorkflowSearchFilters {
  assignedAgentId: string | null;
  dateFrom: string;
  dateTo: string;
  reviewer: 'all' | 'has' | 'none';
  status: WorkflowItemStatus | 'all';
}

export interface WorkflowSearchResult {
  id: string;
  primaryAgentName: string | null;
  projectId: string;
  projectName: string | null;
  reviewerName: string | null;
  score: number;
  snippet: string;
  snippetLabel: string;
  status: WorkflowItemStatus;
  statusLabel: string;
  title: string;
  updatedAt: number;
}

export const defaultWorkflowSearchFilters: WorkflowSearchFilters = {
  assignedAgentId: null,
  dateFrom: '',
  dateTo: '',
  reviewer: 'all',
  status: 'all',
};

/** Returns whether any workflow search filters are active. */
export function hasActiveWorkflowSearchFilters(filters: WorkflowSearchFilters) {
  return (
    filters.assignedAgentId !== null ||
    filters.dateFrom.trim().length > 0 ||
    filters.dateTo.trim().length > 0 ||
    filters.reviewer !== 'all' ||
    filters.status !== 'all'
  );
}

/** Builds a local search index for workflow items. */
export function buildWorkflowSearchIndex(
  items: WorkflowItem[],
  agents: Array<Pick<Agent, 'id' | 'name'>>,
  projects: Array<Pick<WorkflowProject, 'id' | 'name'>>,
): WorkflowSearchIndexEntry[] {
  const agentNamesById = new Map(agents.map((agent) => [agent.id, agent.name] as const));
  const projectNamesById = new Map(projects.map((project) => [project.id, project.name] as const));

  return items.map((item) => {
    const blocks = [
      createSearchBlock('title', 'Title', item.title),
      createSearchBlock('brief', 'Brief', item.brief),
      ...item.workProducts.flatMap((product) => ([
        createSearchBlock('work-product-title', 'Work product', product.title),
        createSearchBlock('work-product-body', `Work product: ${product.title}`, product.body),
      ])),
    ].filter((block): block is WorkflowSearchTextBlock => block !== null);

    return {
      blocks,
      createdAt: item.createdAt,
      id: item.id,
      indexedText: blocks.map((block) => block.normalizedText).join('\n'),
      primaryAgentId: item.primaryAgentId,
      primaryAgentName: item.primaryAgentId
        ? agentNamesById.get(item.primaryAgentId) ?? null
        : null,
      projectId: item.projectId,
      projectName: projectNamesById.get(item.projectId) ?? null,
      reviewerName: item.reviewerName,
      status: item.status,
      statusLabel: formatWorkflowItemStatus(item.status),
      title: item.title,
      updatedAt: item.updatedAt,
    };
  });
}

/** Searches the in-memory workflow search index. */
export function searchWorkflowIndex(
  index: WorkflowSearchIndexEntry[],
  input: {
    filters: WorkflowSearchFilters;
    query: string;
  },
): WorkflowSearchResult[] {
  const normalizedQuery = normalizeSearchText(input.query);
  const queryTokens = tokenizeSearchQuery(normalizedQuery);

  return index
    .flatMap((entry) => {
      if (!matchesSearchFilters(entry, input.filters)) {
        return [];
      }

      if (
        queryTokens.length > 0 &&
        !queryTokens.every((token) => entry.indexedText.includes(token))
      ) {
        return [];
      }

      const bestBlock = queryTokens.length > 0
        ? pickBestBlock(entry, queryTokens, normalizedQuery)
        : getFallbackBlock(entry);
      const snippetBlock = bestBlock ?? getFallbackBlock(entry);

      if (!snippetBlock) {
        return [];
      }

      const score = queryTokens.length > 0
        ? createSearchScore(entry, snippetBlock, queryTokens, normalizedQuery)
        : entry.updatedAt;

      return [{
        id: entry.id,
        primaryAgentName: entry.primaryAgentName,
        projectId: entry.projectId,
        projectName: entry.projectName,
        reviewerName: entry.reviewerName,
        score,
        snippet: buildSnippet(snippetBlock.text, normalizedQuery, queryTokens),
        snippetLabel: snippetBlock.label,
        status: entry.status,
        statusLabel: entry.statusLabel,
        title: entry.title,
        updatedAt: entry.updatedAt,
      }];
    })
    .sort((left, right) => {
      if (left.score !== right.score) {
        return right.score - left.score;
      }

      if (left.updatedAt !== right.updatedAt) {
        return right.updatedAt - left.updatedAt;
      }

      return left.title.localeCompare(right.title);
    });
}

function createSearchBlock(
  kind: WorkflowSearchTextBlockKind,
  label: string,
  text: string,
) {
  const normalizedText = normalizeSearchText(text);

  if (!normalizedText) {
    return null;
  }

  return {
    kind,
    label,
    normalizedText,
    text: text.trim(),
  };
}

function normalizeSearchText(value: string) {
  return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

function tokenizeSearchQuery(value: string) {
  return value
    .split(' ')
    .map((token) => token.trim())
    .filter(Boolean);
}

function countMatchedTokens(text: string, queryTokens: string[]) {
  return queryTokens.reduce(
    (count, token) => count + (text.includes(token) ? 1 : 0),
    0,
  );
}

function getBlockWeight(kind: WorkflowSearchTextBlockKind) {
  switch (kind) {
    case 'title':
      return 180;
    case 'brief':
      return 140;
    case 'work-product-title':
      return 120;
    case 'work-product-body':
      return 100;
  }
}

function pickBestBlock(
  entry: WorkflowSearchIndexEntry,
  queryTokens: string[],
  normalizedQuery: string,
) {
  return entry.blocks.reduce<WorkflowSearchTextBlock | null>((bestBlock, block) => {
    const blockMatchCount = countMatchedTokens(block.normalizedText, queryTokens);

    if (blockMatchCount === 0) {
      return bestBlock;
    }

    if (!bestBlock) {
      return block;
    }

    const bestScore = createBlockScore(bestBlock, queryTokens, normalizedQuery);
    const nextScore = createBlockScore(block, queryTokens, normalizedQuery);

    return nextScore > bestScore ? block : bestBlock;
  }, null);
}

function createBlockScore(
  block: WorkflowSearchTextBlock,
  queryTokens: string[],
  normalizedQuery: string,
) {
  return (
    getBlockWeight(block.kind) +
    (block.normalizedText.includes(normalizedQuery) ? 60 : 0) +
    countMatchedTokens(block.normalizedText, queryTokens) * 12
  );
}

function createSearchScore(
  entry: WorkflowSearchIndexEntry,
  block: WorkflowSearchTextBlock,
  queryTokens: string[],
  normalizedQuery: string,
) {
  return (
    createBlockScore(block, queryTokens, normalizedQuery) +
    (normalizeSearchText(entry.title).includes(normalizedQuery) ? 24 : 0)
  );
}

function getFallbackBlock(entry: WorkflowSearchIndexEntry) {
  return entry.blocks.find((block) => block.kind !== 'title') ?? entry.blocks[0] ?? null;
}

function buildSnippet(
  text: string,
  normalizedQuery: string,
  queryTokens: string[],
) {
  const normalizedText = text.replace(/\s+/g, ' ').trim();

  if (!normalizedText) {
    return '';
  }

  if (!normalizedQuery) {
    return normalizedText.length > 160
      ? `${normalizedText.slice(0, 157).trimEnd()}...`
      : normalizedText;
  }

  const loweredText = normalizedText.toLowerCase();
  let matchIndex = loweredText.indexOf(normalizedQuery);

  if (matchIndex === -1) {
    for (const token of queryTokens) {
      const tokenIndex = loweredText.indexOf(token);

      if (tokenIndex !== -1) {
        matchIndex = tokenIndex;
        break;
      }
    }
  }

  if (matchIndex === -1) {
    return normalizedText.length > 160
      ? `${normalizedText.slice(0, 157).trimEnd()}...`
      : normalizedText;
  }

  const start = Math.max(0, matchIndex - SEARCH_SNIPPET_WINDOW);
  const end = Math.min(
    normalizedText.length,
    matchIndex + Math.max(normalizedQuery.length, 18) + SEARCH_SNIPPET_WINDOW,
  );

  return [
    start > 0 ? '...' : '',
    normalizedText.slice(start, end).trim(),
    end < normalizedText.length ? '...' : '',
  ].join('');
}

function matchesSearchFilters(
  entry: WorkflowSearchIndexEntry,
  filters: WorkflowSearchFilters,
) {
  if (filters.status !== 'all' && entry.status !== filters.status) {
    return false;
  }

  if (
    filters.assignedAgentId !== null &&
    entry.primaryAgentId !== filters.assignedAgentId
  ) {
    return false;
  }

  if (filters.reviewer === 'has' && !entry.reviewerName) {
    return false;
  }

  if (filters.reviewer === 'none' && entry.reviewerName) {
    return false;
  }

  const fromTimestamp = parseDateBoundary(filters.dateFrom, 'start');
  if (fromTimestamp !== null && entry.updatedAt < fromTimestamp) {
    return false;
  }

  const toTimestamp = parseDateBoundary(filters.dateTo, 'end');
  if (toTimestamp !== null && entry.updatedAt > toTimestamp) {
    return false;
  }

  return true;
}

function parseDateBoundary(
  value: string,
  boundary: 'end' | 'start',
) {
  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return null;
  }

  const timestamp = new Date(
    `${trimmedValue}T${boundary === 'start' ? '00:00:00.000' : '23:59:59.999'}`,
  ).getTime();

  return Number.isNaN(timestamp) ? null : timestamp;
}
