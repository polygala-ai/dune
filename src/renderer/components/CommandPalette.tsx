// Work item search command palette.

import {
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  Filter,
  Search,
  Sparkles,
  X,
} from 'lucide-react';

import {
  areWorkItemFiltersEmpty,
  createDefaultWorkItemFilters,
  SearchIndex,
  unassignedAgentFilterId,
  type ReviewerFilter,
  type WorkItemSearchResult,
  type WorkItemFilters,
} from '@/renderer/utils/SearchIndex';
import type { Agent } from '@/renderer/features/agents/types';
import {
  workflowItemStatuses,
  type WorkflowItem,
  type WorkflowItemStatus,
} from '@/renderer/features/workflow/types';
import { workflowItemStatusLabels } from '@/renderer/features/workflow/model/workflow-presenters';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/renderer/shared/ui/dialog';
import { Button } from '@/renderer/shared/ui/button';
import { Input } from '@/renderer/shared/ui/input';
import { cn } from '@/renderer/shared/lib/utils';

/** Command palette props. */
interface CommandPaletteProps {
  agents: Agent[];
  filters?: WorkItemFilters;
  items: WorkflowItem[];
  onFiltersChange?: (filters: WorkItemFilters) => void;
  onOpenChange: (open: boolean) => void;
  onSelectItem: (itemId: string, projectId: string) => void;
  open: boolean;
}

const reviewerOptions: Array<{ label: string; value: ReviewerFilter }> = [
  { label: 'Any reviewer', value: 'all' },
  { label: 'Has reviewer', value: 'has' },
  { label: 'No reviewer', value: 'none' },
];

function toggleStatus(statuses: WorkflowItemStatus[], status: WorkflowItemStatus) {
  return statuses.includes(status)
    ? statuses.filter((candidate) => candidate !== status)
    : [...statuses, status];
}

function toggleAgent(agentIds: string[], agentId: string) {
  return agentIds.includes(agentId)
    ? agentIds.filter((candidate) => candidate !== agentId)
    : [...agentIds, agentId];
}

function HighlightedSnippet({
  query,
  snippet,
}: {
  query: string;
  snippet: string;
}) {
  const trimmedQuery = query.trim();

  if (!trimmedQuery) {
    return <>{snippet}</>;
  }

  const matchIndex = snippet.toLocaleLowerCase().indexOf(trimmedQuery.toLocaleLowerCase());

  if (matchIndex === -1) {
    return <>{snippet}</>;
  }

  const before = snippet.slice(0, matchIndex);
  const match = snippet.slice(matchIndex, matchIndex + trimmedQuery.length);
  const after = snippet.slice(matchIndex + trimmedQuery.length);

  return (
    <>
      {before}
      <mark className="rounded bg-app-accent-soft px-0.5 text-app-text">
        {match}
      </mark>
      {after}
    </>
  );
}

function ResultRow({
  active,
  query,
  result,
  onSelect,
}: {
  active: boolean;
  query: string;
  result: WorkItemSearchResult;
  onSelect: () => void;
}) {
  return (
    <button
      className={cn(
        'grid w-full grid-cols-[minmax(0,1fr)_auto] gap-3 rounded-[16px] px-4 py-3 text-left transition-colors',
        active ? 'bg-app-accent-soft text-app-text' : 'hover:bg-app-card',
      )}
      onClick={onSelect}
      type="button"
    >
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold text-app-text">
          {result.title}
        </span>
        <span className="mt-1 block line-clamp-2 text-xs leading-5 text-app-muted">
          <HighlightedSnippet query={query} snippet={result.snippet} />
        </span>
      </span>
      <span className="flex min-w-[132px] flex-col items-end gap-1 text-right">
        <span className="pill-key bg-app-card text-[11px]">
          {result.statusLabel}
        </span>
        <span className="max-w-[160px] truncate text-[11px] text-app-muted">
          {result.assignee}
        </span>
      </span>
    </button>
  );
}

/** Renders a global work item search palette. */
export function CommandPalette({
  agents,
  filters = createDefaultWorkItemFilters(),
  items,
  onFiltersChange,
  onOpenChange,
  onSelectItem,
  open,
}: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const index = useMemo(() => new SearchIndex(items, agents), [agents, items]);
  const results = useMemo(
    () => index.search(query, filters).slice(0, 12),
    [filters, index, query],
  );
  const hasActiveFilters = !areWorkItemFiltersEmpty(filters);
  const assignedAgentIds = useMemo(
    () => new Set(items.flatMap((item) => (item.primaryAgentId ? [item.primaryAgentId] : []))),
    [items],
  );
  const filterAgents = useMemo(
    () => agents
      .filter((agent) => assignedAgentIds.has(agent.id))
      .sort((left, right) => left.name.localeCompare(right.name)),
    [agents, assignedAgentIds],
  );

  const updateFilters = (nextFilters: WorkItemFilters) => {
    onFiltersChange?.(nextFilters);
  };

  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIndex(0);
    }
  }, [open]);

  useEffect(() => {
    setActiveIndex(0);
  }, [filters, query]);

  const selectResult = (result: WorkItemSearchResult | undefined) => {
    if (!result) {
      return;
    }

    onOpenChange(false);
    onSelectItem(result.id, result.projectId);
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent
        className="overflow-hidden border-app-border bg-app-panel-strong p-0"
        overlayClassName="bg-black/55 backdrop-blur-[2px]"
      >
        <DialogTitle className="sr-only">Search work items</DialogTitle>
        <DialogDescription className="sr-only">
          Search work item titles, briefs, and work product content.
        </DialogDescription>

        <div
          className="flex h-full w-full flex-col overflow-hidden rounded-[22px] bg-app-panel-strong text-app-text"
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              setActiveIndex((current) => Math.min(current + 1, results.length - 1));
              return;
            }

            if (event.key === 'ArrowUp') {
              event.preventDefault();
              setActiveIndex((current) => Math.max(current - 1, 0));
              return;
            }

            if (event.key === 'Enter') {
              event.preventDefault();
              selectResult(results[activeIndex]);
            }
          }}
        >
          <div className="flex h-14 items-center gap-3 border-b border-app-border px-4">
            <Search className="h-4 w-4 shrink-0 text-app-muted" />
            <Input
              autoFocus
              className="h-12 border-0 bg-transparent px-0 focus-visible:ring-0"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search titles, briefs, and work products…"
              value={query}
            />
          </div>

          <div className="border-b border-app-border px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-app-muted">
                <Filter className="h-3.5 w-3.5" />
                Filters
              </div>
              {hasActiveFilters ? (
                <Button
                  onClick={() => updateFilters(createDefaultWorkItemFilters())}
                  size="sm"
                  type="button"
                  variant="quiet"
                >
                  <X className="h-4 w-4" />
                  Clear
                </Button>
              ) : null}
            </div>

            <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(220px,1.3fr)_minmax(180px,1fr)_minmax(220px,1.1fr)_minmax(160px,0.8fr)]">
              <fieldset>
                <legend className="sr-only">Status</legend>
                <div className="flex flex-wrap gap-2">
                  {workflowItemStatuses.map((status) => (
                    <label
                      className={cn(
                        'pill-key cursor-pointer',
                        filters.statuses.includes(status) ? 'bg-app-accent-soft text-app-text' : '',
                      )}
                      key={status}
                    >
                      <input
                        checked={filters.statuses.includes(status)}
                        className="sr-only"
                        onChange={() => {
                          updateFilters({
                            ...filters,
                            statuses: toggleStatus(filters.statuses, status),
                          });
                        }}
                        type="checkbox"
                      />
                      {workflowItemStatusLabels[status]}
                    </label>
                  ))}
                </div>
              </fieldset>

              <fieldset>
                <legend className="sr-only">Assigned agent</legend>
                <div className="thin-scrollbar flex max-h-[88px] flex-col gap-2 overflow-y-auto pr-1">
                  <label
                    className={cn(
                      'pill-key cursor-pointer justify-start',
                      filters.agentIds.includes(unassignedAgentFilterId)
                        ? 'bg-app-accent-soft text-app-text'
                        : '',
                    )}
                  >
                    <input
                      checked={filters.agentIds.includes(unassignedAgentFilterId)}
                      className="sr-only"
                      onChange={() => {
                        updateFilters({
                          ...filters,
                          agentIds: toggleAgent(filters.agentIds, unassignedAgentFilterId),
                        });
                      }}
                      type="checkbox"
                    />
                    Unassigned
                  </label>
                  {filterAgents.map((agent) => (
                    <label
                      className={cn(
                        'pill-key min-w-0 cursor-pointer justify-start',
                        filters.agentIds.includes(agent.id) ? 'bg-app-accent-soft text-app-text' : '',
                      )}
                      key={agent.id}
                    >
                      <input
                        checked={filters.agentIds.includes(agent.id)}
                        className="sr-only"
                        onChange={() => {
                          updateFilters({
                            ...filters,
                            agentIds: toggleAgent(filters.agentIds, agent.id),
                          });
                        }}
                        type="checkbox"
                      />
                      <span className="truncate">{agent.name}</span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <fieldset>
                <legend className="sr-only">Date range</legend>
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    aria-label="Created from"
                    onChange={(event) => {
                      updateFilters({
                        ...filters,
                        dateFrom: event.target.value,
                      });
                    }}
                    type="date"
                    value={filters.dateFrom}
                  />
                  <Input
                    aria-label="Created to"
                    onChange={(event) => {
                      updateFilters({
                        ...filters,
                        dateTo: event.target.value,
                      });
                    }}
                    type="date"
                    value={filters.dateTo}
                  />
                </div>
              </fieldset>

              <label className="min-w-0">
                <span className="sr-only">Reviewer</span>
                <select
                  className="focus-ring-app h-11 w-full rounded-[16px] border border-app-border bg-app-panel px-3 text-sm text-app-text outline-none focus-visible:ring-2"
                  onChange={(event) => {
                    updateFilters({
                      ...filters,
                      reviewer: event.target.value as ReviewerFilter,
                    });
                  }}
                  value={filters.reviewer}
                >
                  {reviewerOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          <div className="thin-scrollbar max-h-[440px] overflow-y-auto p-2">
            {results.length > 0 ? (
              <div className="flex flex-col gap-1">
                {results.map((result, index) => (
                  <ResultRow
                    active={index === activeIndex}
                    key={result.id}
                    onSelect={() => selectResult(result)}
                    query={query}
                    result={result}
                  />
                ))}
              </div>
            ) : (
              <div className="flex min-h-[180px] flex-col items-center justify-center px-6 text-center">
                <Sparkles className="h-5 w-5 text-app-muted" />
                <p className="mt-3 text-sm font-medium text-app-text">
                  No matching work items
                </p>
                <p className="mt-1 text-xs leading-5 text-app-muted">
                  Try a title, brief detail, or text from a work product.
                </p>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
