// Workflow board filter panel.

import {
  ChevronDown,
  SlidersHorizontal,
  X,
} from 'lucide-react';

import {
  areWorkItemFiltersEmpty,
  countActiveWorkItemFilters,
  createDefaultWorkItemFilters,
  type ReviewerFilter,
  unassignedAgentFilterId,
  type WorkItemDateFilterField,
  type WorkItemFilters,
} from '@/renderer/utils/searchIndex';
import {
  workflowItemStatusLabels,
} from '@/renderer/features/workflow/model/workflow-presenters';
import {
  workflowItemStatuses,
  type WorkflowItemStatus,
} from '@/renderer/features/workflow/types';
import { Button } from '@/renderer/shared/ui/button';
import { Input } from '@/renderer/shared/ui/input';
import { cn } from '@/renderer/shared/lib/utils';

/** Filter panel agent shape. */
interface FilterPanelAgent {
  id: string;
  name: string;
}

/** Filter panel props. */
interface FilterPanelProps {
  agents: FilterPanelAgent[];
  filters: WorkItemFilters;
  isOpen: boolean;
  matchCount: number;
  onChange: (filters: WorkItemFilters) => void;
  onToggleOpen: () => void;
  totalCount: number;
}

const reviewerOptions: Array<{ label: string; value: ReviewerFilter }> = [
  { label: 'Any reviewer state', value: 'all' },
  { label: 'Has reviewer signal', value: 'has' },
  { label: 'No reviewer signal', value: 'none' },
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

/** Renders the workflow board filters. */
export function FilterPanel({
  agents,
  filters,
  isOpen,
  matchCount,
  onChange,
  onToggleOpen,
  totalCount,
}: FilterPanelProps) {
  const isFiltered = !areWorkItemFiltersEmpty(filters);
  const activeFilterCount = countActiveWorkItemFilters(filters);

  return (
    <section className="rounded-[22px] border border-app-border bg-app-panel/70">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <button
          aria-expanded={isOpen}
          className="flex min-w-0 items-center gap-2 text-left"
          onClick={onToggleOpen}
          type="button"
        >
          <SlidersHorizontal className="h-4 w-4 shrink-0 text-app-muted" />
          <span className="text-sm font-semibold text-app-text">Filters</span>
          <span className="truncate text-xs text-app-muted">
            {matchCount}/{totalCount} work items
          </span>
          {activeFilterCount > 0 ? (
            <span
              aria-label={`${activeFilterCount} active filters`}
              className="flex h-5 min-w-5 items-center justify-center rounded-full bg-app-accent px-1.5 text-[11px] font-semibold text-white"
            >
              {activeFilterCount}
            </span>
          ) : null}
          <ChevronDown
            className={cn(
              'h-4 w-4 shrink-0 text-app-muted transition-transform',
              isOpen ? 'rotate-180' : '',
            )}
          />
        </button>

        {isFiltered ? (
          <Button
            onClick={() => onChange(createDefaultWorkItemFilters())}
            size="sm"
            type="button"
            variant="quiet"
          >
            <X className="h-4 w-4" />
            Clear
          </Button>
        ) : null}
      </div>

      {isOpen ? (
        <div className="grid gap-4 border-t border-app-border px-4 py-4 lg:grid-cols-[minmax(220px,1.2fr)_minmax(180px,1fr)_minmax(220px,1.2fr)_minmax(180px,1fr)]">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-app-muted">
              Status
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
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
                      onChange({
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
          </div>

          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-app-muted">
              Agent
            </div>
            <div className="mt-3 flex max-h-[128px] flex-col gap-2 overflow-y-auto pr-1">
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
                    onChange({
                      ...filters,
                      agentIds: toggleAgent(filters.agentIds, unassignedAgentFilterId),
                    });
                  }}
                  type="checkbox"
                />
                Unassigned
              </label>
              {agents.map((agent) => (
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
                      onChange({
                        ...filters,
                        agentIds: toggleAgent(filters.agentIds, agent.id),
                      });
                    }}
                    type="checkbox"
                  />
                  <span className="truncate">
                    {agent.name}
                  </span>
                </label>
              ))}
              {agents.length === 0 ? (
                <div className="text-xs text-app-muted">
                  No project agents yet
                </div>
              ) : null}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between gap-2">
              <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-app-muted">
                Date range
              </div>
              <select
                aria-label="Date filter field"
                className="focus-ring-app h-8 rounded-[12px] border border-app-border bg-app-panel px-2 text-xs text-app-text outline-none focus-visible:ring-2"
                onChange={(event) => {
                  onChange({
                    ...filters,
                    dateField: event.target.value as WorkItemDateFilterField,
                  });
                }}
                value={filters.dateField}
              >
                <option value="created">Created</option>
                <option value="updated">Updated</option>
              </select>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Input
                aria-label={`${filters.dateField === 'updated' ? 'Updated' : 'Created'} from`}
                onChange={(event) => {
                  onChange({
                    ...filters,
                    dateFrom: event.target.value,
                  });
                }}
                type="date"
                value={filters.dateFrom}
              />
              <Input
                aria-label={`${filters.dateField === 'updated' ? 'Updated' : 'Created'} to`}
                onChange={(event) => {
                  onChange({
                    ...filters,
                    dateTo: event.target.value,
                  });
                }}
                type="date"
                value={filters.dateTo}
              />
            </div>
          </div>

          <label className="min-w-0">
            <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-app-muted">
              Reviewer
            </span>
            <select
              className="focus-ring-app mt-3 h-11 w-full rounded-[16px] border border-app-border bg-app-panel px-3 text-sm text-app-text outline-none focus-visible:ring-2"
              onChange={(event) => {
                onChange({
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
      ) : null}
    </section>
  );
}
