// Workflow item filter panel.

import { RotateCcw } from 'lucide-react';

import {
  defaultWorkflowItemFilters,
  hasActiveWorkflowItemFilters,
  type WorkflowItemFilters,
} from '@/renderer/features/workflow/model/workflow-filters';
import {
  workflowItemStatusLabels,
} from '@/renderer/features/workflow/model/workflow-presenters';
import {
  workflowItemStatuses,
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
  filters: WorkflowItemFilters;
  matchCount: number;
  onChange: (filters: WorkflowItemFilters) => void;
  totalCount: number;
}

const selectClassName =
  'focus-ring-app h-11 rounded-[16px] border border-app-border bg-app-panel px-3 text-sm text-app-text outline-none transition-colors focus-visible:border-app-border-strong focus-visible:ring-2';

/** Renders workflow board filters. */
export function FilterPanel({
  agents,
  filters,
  matchCount,
  onChange,
  totalCount,
}: FilterPanelProps) {
  const hasActiveFilters = hasActiveWorkflowItemFilters(filters);

  const updateFilters = (nextFilters: Partial<WorkflowItemFilters>) => {
    onChange({
      ...filters,
      ...nextFilters,
    });
  };

  return (
    <section
      aria-label="Work item filters"
      className="flex flex-wrap items-end gap-3 border-b border-app-border pb-4"
    >
      <label className="flex min-w-[150px] flex-1 flex-col gap-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-app-muted">
          Status
        </span>
        <select
          className={selectClassName}
          onChange={(event) => updateFilters({ status: event.target.value as WorkflowItemFilters['status'] })}
          value={filters.status}
        >
          <option value="all">All statuses</option>
          {workflowItemStatuses.map((status) => (
            <option key={status} value={status}>
              {workflowItemStatusLabels[status]}
            </option>
          ))}
        </select>
      </label>

      <label className="flex min-w-[190px] flex-1 flex-col gap-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-app-muted">
          Agent
        </span>
        <select
          className={selectClassName}
          onChange={(event) => updateFilters({ agentId: event.target.value })}
          value={filters.agentId}
        >
          <option value="all">All agents</option>
          <option value="unassigned">No agent</option>
          {agents.map((agent) => (
            <option key={agent.id} value={agent.id}>
              {agent.name}
            </option>
          ))}
        </select>
      </label>

      <label className="flex min-w-[160px] flex-1 flex-col gap-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-app-muted">
          Reviewer
        </span>
        <select
          className={selectClassName}
          onChange={(event) => updateFilters({ reviewer: event.target.value as WorkflowItemFilters['reviewer'] })}
          value={filters.reviewer}
        >
          <option value="all">Any reviewer</option>
          <option value="has">Has reviewer feedback</option>
          <option value="none">No reviewer feedback</option>
        </select>
      </label>

      <label className="flex min-w-[150px] flex-1 flex-col gap-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-app-muted">
          Updated after
        </span>
        <Input
          onChange={(event) => updateFilters({ dateFrom: event.target.value })}
          type="date"
          value={filters.dateFrom}
        />
      </label>

      <label className="flex min-w-[150px] flex-1 flex-col gap-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-app-muted">
          Updated before
        </span>
        <Input
          onChange={(event) => updateFilters({ dateTo: event.target.value })}
          type="date"
          value={filters.dateTo}
        />
      </label>

      <div className="flex items-center gap-3">
        <span
          className={cn(
            'whitespace-nowrap text-sm text-app-muted',
            hasActiveFilters ? 'text-app-text' : undefined,
          )}
        >
          {matchCount}/{totalCount} shown
        </span>
        <Button
          aria-label="Clear work item filters"
          disabled={!hasActiveFilters}
          onClick={() => onChange(defaultWorkflowItemFilters)}
          size="icon"
          type="button"
          variant="quiet"
        >
          <RotateCcw className="h-4 w-4" />
        </Button>
      </div>
    </section>
  );
}
