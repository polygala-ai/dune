// In-memory work item search index.

import type { Agent } from '@/renderer/features/agents/types';
import {
  formatWorkflowItemStatus,
} from '@/renderer/features/workflow/model/workflow-presenters';
import type {
  WorkflowItem,
  WorkflowItemStatus,
  WorkflowProject,
} from '@/renderer/features/workflow/types';

/** Search result shape. */
export interface WorkItemSearchResult {
  assigneeName: string | null;
  itemId: string;
  projectName: string;
  snippet: string;
  status: WorkflowItemStatus;
  statusLabel: string;
  title: string;
}

interface SearchDocument {
  assigneeName: string | null;
  createdAt: number;
  itemId: string;
  projectName: string;
  searchableText: string;
  searchableTextLower: string;
  status: WorkflowItemStatus;
  title: string;
  updatedAt: number;
}

/** Work item search index. */
export interface SearchIndex {
  search: (query: string, limit?: number) => WorkItemSearchResult[];
}

/** Normalizes search input. */
function normalizeQuery(query: string) {
  return query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
}

/** Builds indexed text for one item. */
function getSearchableText(item: WorkflowItem) {
  return [
    item.title,
    item.brief,
    ...item.workProducts.flatMap((product) => [product.title, product.body]),
  ]
    .filter(Boolean)
    .join('\n');
}

/** Creates a compact match snippet. */
function createSnippet(text: string, terms: string[]) {
  const collapsedText = text.replace(/\s+/g, ' ').trim();

  if (!collapsedText) {
    return 'No matching text.';
  }

  const lowerText = collapsedText.toLowerCase();
  const firstMatchIndex = terms.reduce<number | null>((currentIndex, term) => {
    const matchIndex = lowerText.indexOf(term);

    if (matchIndex === -1) {
      return currentIndex;
    }

    return currentIndex === null ? matchIndex : Math.min(currentIndex, matchIndex);
  }, null);

  if (firstMatchIndex === null) {
    return collapsedText.slice(0, 140);
  }

  const start = Math.max(0, firstMatchIndex - 52);
  const end = Math.min(collapsedText.length, firstMatchIndex + 108);
  const prefix = start > 0 ? '...' : '';
  const suffix = end < collapsedText.length ? '...' : '';

  return `${prefix}${collapsedText.slice(start, end)}${suffix}`;
}

/** Scores document match quality. */
function scoreDocument(document: SearchDocument, terms: string[]) {
  const titleLower = document.title.toLowerCase();
  let score = 0;

  for (const term of terms) {
    if (titleLower === term) {
      score += 120;
    } else if (titleLower.startsWith(term)) {
      score += 80;
    } else if (titleLower.includes(term)) {
      score += 55;
    } else {
      score += 12;
    }
  }

  return score + Math.floor(document.updatedAt / 1_000_000_000);
}

/** Creates a local work item search index. */
export function createSearchIndex(
  items: WorkflowItem[],
  agents: Agent[],
  projects: WorkflowProject[],
): SearchIndex {
  const agentsById = new Map(agents.map((agent) => [agent.id, agent] as const));
  const projectsById = new Map(projects.map((project) => [project.id, project] as const));
  const documents: SearchDocument[] = items.map((item) => {
    const searchableText = getSearchableText(item);
    const assigneeName = item.primaryAgentId
      ? agentsById.get(item.primaryAgentId)?.name ?? null
      : null;

    return {
      assigneeName,
      createdAt: item.createdAt,
      itemId: item.id,
      projectName: projectsById.get(item.projectId)?.name ?? 'Project',
      searchableText,
      searchableTextLower: searchableText.toLowerCase(),
      status: item.status,
      title: item.title,
      updatedAt: item.updatedAt,
    };
  });

  return {
    search: (query, limit = 8) => {
      const terms = normalizeQuery(query);

      if (terms.length === 0) {
        return [];
      }

      return documents
        .filter((document) =>
          terms.every((term) => document.searchableTextLower.includes(term)),
        )
        .sort((left, right) => scoreDocument(right, terms) - scoreDocument(left, terms))
        .slice(0, limit)
        .map((document) => ({
          assigneeName: document.assigneeName,
          itemId: document.itemId,
          projectName: document.projectName,
          snippet: createSnippet(document.searchableText, terms),
          status: document.status,
          statusLabel: formatWorkflowItemStatus(document.status),
          title: document.title,
        }));
    },
  };
}
