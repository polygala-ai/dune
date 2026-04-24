// Command menu UI.

import {
  startTransition,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  Bot,
  Filter,
  PanelRight,
  Plus,
  Settings2,
  Sparkles,
  X,
} from 'lucide-react';

import { useDesktopPlatform } from '@/renderer/shared/lib/use-desktop-platform';
import {
  areWorkItemFiltersEmpty,
  createDefaultWorkItemFilters,
  SearchIndex,
  unassignedAgentFilterId,
  type ReviewerFilter,
  type WorkItemFilters,
} from '@/renderer/utils/SearchIndex';
import type { Agent } from '@/renderer/features/agents/types';
import {
  workflowItemStatuses,
  type WorkflowItem,
  type WorkflowItemStatus,
} from '@/renderer/features/workflow/types';
import { workflowItemStatusLabels } from '@/renderer/features/workflow/model/workflow-presenters';
import { Button } from '@/renderer/shared/ui/button';
import { Input } from '@/renderer/shared/ui/input';
import { cn } from '@/renderer/shared/lib/utils';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from '@/renderer/shared/ui/command';

/** Command agent shape. */
interface CommandAgent {
  id: string;
  name: string;
  projectId: string | null;
  preview: string;
  statusLabel: string;
  updatedLabel: string;
  workspace: string;
}

/** Command item record shape. */
interface CommandItemRecord {
  id: string;
  statusLabel: string;
  title: string;
  updatedLabel: string;
}

/** Command project shape. */
interface CommandProject {
  description: string;
  id: string;
  name: string;
}

/** Command menu props. */
interface CommandMenuProps {
  agents: CommandAgent[];
  filters?: WorkItemFilters;
  isContextPanelOpen: boolean;
  items: CommandItemRecord[];
  searchAgents?: Agent[];
  searchItems?: WorkflowItem[];
  onCreateAgent: () => void;
  onCreateItem: () => void;
  onCreateProject: () => void;
  onFiltersChange?: (filters: WorkItemFilters) => void;
  onOpenBoard: () => void;
  onOpenChange: (open: boolean) => void;
  onOpenSettings: () => void;
  onSelectAgent: (agentId: string) => void;
  onSelectItem: (itemId: string, projectId?: string) => void;
  onSelectProject: (projectId: string) => void;
  onToggleContextPanel: () => void;
  open: boolean;
  projects: CommandProject[];
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

/** Renders the command menu UI. */
export function CommandMenu({
  agents,
  filters = createDefaultWorkItemFilters(),
  isContextPanelOpen,
  items,
  searchAgents = [],
  searchItems = [],
  onCreateAgent,
  onCreateItem,
  onCreateProject,
  onFiltersChange,
  onOpenBoard,
  onOpenChange,
  onOpenSettings,
  onSelectAgent,
  onSelectItem,
  onSelectProject,
  onToggleContextPanel,
  open,
  projects,
}: CommandMenuProps) {
  const { modifierLabel } = useDesktopPlatform();
  const [query, setQuery] = useState('');
  const index = useMemo(
    () => new SearchIndex(searchItems, searchAgents),
    [searchAgents, searchItems],
  );
  const searchResults = useMemo(
    () => index.search(query, filters).slice(0, 20),
    [filters, index, query],
  );
  const hasActiveFilters = !areWorkItemFiltersEmpty(filters);
  const assignedAgentIds = useMemo(
    () => new Set(searchItems.flatMap((item) => (item.primaryAgentId ? [item.primaryAgentId] : []))),
    [searchItems],
  );
  const filterAgents = useMemo(
    () => searchAgents
      .filter((agent) => assignedAgentIds.has(agent.id))
      .sort((left, right) => left.name.localeCompare(right.name)),
    [assignedAgentIds, searchAgents],
  );

  const closeAndRun = (handler: () => void) => {
    onOpenChange(false);
    startTransition(() => {
      handler();
    });
  };

  const updateFilters = (nextFilters: WorkItemFilters) => {
    onFiltersChange?.(nextFilters);
  };

  useEffect(() => {
    if (open) {
      setQuery('');
    }
  }, [open]);

  return (
    <CommandDialog onOpenChange={onOpenChange} open={open}>
      <CommandInput
        onValueChange={setQuery}
        placeholder="Jump to a project, work item, agent, or action…"
        value={query}
      />
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
      <CommandList className="thin-scrollbar">
        <CommandEmpty>No matching projects, work items, or actions.</CommandEmpty>
        <CommandGroup heading="Actions">
          <CommandItem onSelect={() => closeAndRun(onCreateItem)}>
            <Plus className="h-4 w-4 text-app-muted" />
            <span className="flex-1 truncate">New work item</span>
            <CommandShortcut>{modifierLabel}N</CommandShortcut>
          </CommandItem>

          <CommandItem onSelect={() => closeAndRun(onCreateProject)}>
            <Plus className="h-4 w-4 text-app-muted" />
            <span className="flex-1 truncate">New project</span>
          </CommandItem>

          <CommandItem onSelect={() => closeAndRun(onCreateAgent)}>
            <Plus className="h-4 w-4 text-app-muted" />
            <span className="flex-1 truncate">New agent</span>
          </CommandItem>

          <CommandItem onSelect={() => closeAndRun(onOpenBoard)}>
            <Sparkles className="h-4 w-4 text-app-muted" />
            <span className="flex-1 truncate">Project board</span>
          </CommandItem>

          <CommandItem onSelect={() => closeAndRun(onOpenSettings)}>
            <Settings2 className="h-4 w-4 text-app-muted" />
            <span className="flex-1 truncate">Settings</span>
            <CommandShortcut>{modifierLabel},</CommandShortcut>
          </CommandItem>

          <CommandItem onSelect={() => closeAndRun(onToggleContextPanel)}>
            <PanelRight className="h-4 w-4 text-app-muted" />
            <span className="flex-1 truncate">
              {isContextPanelOpen ? 'Hide' : 'Show'} context panel
            </span>
            <CommandShortcut>{modifierLabel}\</CommandShortcut>
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Projects">
          {projects.map((project) => (
            <CommandItem
              key={project.id}
              onSelect={() => closeAndRun(() => onSelectProject(project.id))}
              value={`${project.name} ${project.description}`}
            >
              <Sparkles className="h-4 w-4 text-app-muted" />
              <div className="flex min-w-0 flex-col">
                <span className="truncate">{project.name}</span>
                <span className="truncate text-xs text-app-muted">
                  {project.description || 'Project'}
                </span>
              </div>
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Work items">
          {(searchItems.length > 0 ? searchResults : items.map((item) => ({
            assignee: '',
            id: item.id,
            projectId: undefined,
            score: 1,
            snippet: item.statusLabel,
            status: undefined,
            statusLabel: item.statusLabel,
            title: item.title,
            updatedLabel: item.updatedLabel,
          }))).map((item) => (
            <CommandItem
              key={item.id}
              onSelect={() => closeAndRun(() => onSelectItem(item.id, item.projectId))}
              value={`${item.title} ${item.statusLabel} ${item.snippet} ${item.assignee}`}
            >
              <Sparkles className="h-4 w-4 text-app-muted" />
              <div className="flex min-w-0 flex-col">
                <span className="truncate">{item.title}</span>
                <span className="truncate text-xs text-app-muted">
                  {item.assignee ? `${item.statusLabel} · ${item.assignee} · ${item.snippet}` : item.statusLabel}
                </span>
              </div>
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Agents">
          {agents.map((agent) => (
            <CommandItem
              key={agent.id}
              onSelect={() => closeAndRun(() => onSelectAgent(agent.id))}
              value={`${agent.name} ${agent.preview} ${agent.statusLabel} ${agent.workspace}`}
            >
              <Bot className="h-4 w-4 text-app-muted" />
              <div className="flex min-w-0 flex-col">
                <span className="truncate">{agent.name}</span>
                <span className="truncate text-xs text-app-muted">
                  {agent.statusLabel} · {agent.workspace}
                </span>
              </div>
              <CommandShortcut>{agent.updatedLabel}</CommandShortcut>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
