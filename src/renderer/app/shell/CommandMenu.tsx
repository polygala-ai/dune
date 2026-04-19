// Command menu UI.

import {
  startTransition,
  useEffect,
  useState,
} from 'react';
import {
  Bot,
  PanelRight,
  Plus,
  Search,
  Settings2,
  Sparkles,
} from 'lucide-react';

import { useDesktopPlatform } from '@/renderer/shared/lib/use-desktop-platform';
import {
  CommandDialog,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from '@/renderer/shared/ui/command';
import {
  defaultWorkflowSearchFilters,
  hasActiveWorkflowSearchFilters,
  searchWorkflowIndex,
  type WorkflowSearchFilters,
  type WorkflowSearchIndexEntry,
} from '@/renderer/features/workflow/model/workflow-search';
import { workflowItemStatuses } from '@/renderer/features/workflow/types';
import { formatWorkflowItemStatus } from '@/renderer/features/workflow/model/workflow-presenters';
import { Button } from '@/renderer/shared/ui/button';

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

/** Search agent option shape. */
interface SearchAgentOption {
  id: string;
  name: string;
}

/** Command menu props. */
interface CommandMenuProps {
  agents: CommandAgent[];
  isContextPanelOpen: boolean;
  items: CommandItemRecord[];
  onCreateAgent: () => void;
  onCreateItem: () => void;
  onCreateProject: () => void;
  onOpenBoard: () => void;
  onOpenChange: (open: boolean) => void;
  onOpenSettings: () => void;
  onSelectAgent: (agentId: string) => void;
  onSelectItem: (itemId: string) => void;
  onSelectProject: (projectId: string) => void;
  onToggleContextPanel: () => void;
  open: boolean;
  projects: CommandProject[];
  searchAgentOptions: SearchAgentOption[];
  searchIndex: WorkflowSearchIndexEntry[];
}

/** Counts active filters. */
function countActiveFilters(filters: WorkflowSearchFilters) {
  let count = 0;

  if (filters.status !== 'all') {
    count += 1;
  }

  if (filters.assignedAgentId !== null) {
    count += 1;
  }

  if (filters.reviewer !== 'all') {
    count += 1;
  }

  if (filters.dateFrom.trim()) {
    count += 1;
  }

  if (filters.dateTo.trim()) {
    count += 1;
  }

  return count;
}

/** Renders the command menu UI. */
export function CommandMenu({
  agents,
  isContextPanelOpen,
  items,
  onCreateAgent,
  onCreateItem,
  onCreateProject,
  onOpenBoard,
  onOpenChange,
  onOpenSettings,
  onSelectAgent,
  onSelectItem,
  onSelectProject,
  onToggleContextPanel,
  open,
  projects,
  searchAgentOptions,
  searchIndex,
}: CommandMenuProps) {
  const { modifierLabel } = useDesktopPlatform();
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<WorkflowSearchFilters>(defaultWorkflowSearchFilters);
  const hasActiveFilters = hasActiveWorkflowSearchFilters(filters);
  const activeFilterCount = countActiveFilters(filters);
  const isSearchMode = query.trim().length > 0 || hasActiveFilters;
  const searchResults = isSearchMode
    ? searchWorkflowIndex(searchIndex, { filters, query })
    : [];

  useEffect(() => {
    if (!open) {
      setQuery('');
      setFilters(defaultWorkflowSearchFilters);
    }
  }, [open]);

  const closeAndRun = (handler: () => void) => {
    onOpenChange(false);
    startTransition(() => {
      handler();
    });
  };

  return (
    <CommandDialog
      commandProps={{ shouldFilter: false }}
      onOpenChange={onOpenChange}
      open={open}
    >
      <CommandInput
        onValueChange={setQuery}
        placeholder="Jump to a project, work item, agent, or action…"
        value={query}
      />

      <div className="border-b border-app-border px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-app-muted">
            <Search className="h-3.5 w-3.5" />
            Filters
            {activeFilterCount > 0 ? (
              <span className="rounded-full bg-app-accent-soft px-2 py-0.5 text-[10px] text-app-text">
                {activeFilterCount}
              </span>
            ) : null}
          </div>
          {hasActiveFilters ? (
            <Button
              onClick={() => setFilters(defaultWorkflowSearchFilters)}
              size="sm"
              type="button"
              variant="ghost"
            >
              Clear filters
            </Button>
          ) : null}
        </div>

        <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <label className="min-w-0">
            <span className="mb-1 block text-[11px] font-medium text-app-muted">
              Status
            </span>
            <select
              aria-label="Filter by status"
              className="focus-ring-app h-10 w-full rounded-[14px] border border-app-border bg-app-panel px-3 text-sm text-app-text outline-none transition-colors focus-visible:border-app-border-strong focus-visible:ring-2"
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  status: event.target.value as WorkflowSearchFilters['status'],
                }))
              }
              value={filters.status}
            >
              <option value="all">Any status</option>
              {workflowItemStatuses.map((status) => (
                <option key={status} value={status}>
                  {formatWorkflowItemStatus(status)}
                </option>
              ))}
            </select>
          </label>

          <label className="min-w-0">
            <span className="mb-1 block text-[11px] font-medium text-app-muted">
              Assignee
            </span>
            <select
              aria-label="Filter by assignee"
              className="focus-ring-app h-10 w-full rounded-[14px] border border-app-border bg-app-panel px-3 text-sm text-app-text outline-none transition-colors focus-visible:border-app-border-strong focus-visible:ring-2"
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  assignedAgentId: event.target.value || null,
                }))
              }
              value={filters.assignedAgentId ?? ''}
            >
              <option value="">Any assignee</option>
              {searchAgentOptions.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.name}
                </option>
              ))}
            </select>
          </label>

          <label className="min-w-0">
            <span className="mb-1 block text-[11px] font-medium text-app-muted">
              Reviewer
            </span>
            <select
              aria-label="Filter by reviewer"
              className="focus-ring-app h-10 w-full rounded-[14px] border border-app-border bg-app-panel px-3 text-sm text-app-text outline-none transition-colors focus-visible:border-app-border-strong focus-visible:ring-2"
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  reviewer: event.target.value as WorkflowSearchFilters['reviewer'],
                }))
              }
              value={filters.reviewer}
            >
              <option value="all">Any reviewer state</option>
              <option value="has">Has reviewer</option>
              <option value="none">No reviewer</option>
            </select>
          </label>

          <label className="min-w-0">
            <span className="mb-1 block text-[11px] font-medium text-app-muted">
              Updated from
            </span>
            <input
              aria-label="Filter updated from"
              className="focus-ring-app h-10 w-full rounded-[14px] border border-app-border bg-app-panel px-3 text-sm text-app-text outline-none transition-colors focus-visible:border-app-border-strong focus-visible:ring-2"
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  dateFrom: event.target.value,
                }))
              }
              type="date"
              value={filters.dateFrom}
            />
          </label>

          <label className="min-w-0">
            <span className="mb-1 block text-[11px] font-medium text-app-muted">
              Updated to
            </span>
            <input
              aria-label="Filter updated to"
              className="focus-ring-app h-10 w-full rounded-[14px] border border-app-border bg-app-panel px-3 text-sm text-app-text outline-none transition-colors focus-visible:border-app-border-strong focus-visible:ring-2"
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  dateTo: event.target.value,
                }))
              }
              type="date"
              value={filters.dateTo}
            />
          </label>
        </div>
      </div>

      <CommandList className="thin-scrollbar">
        {isSearchMode ? (
          searchResults.length > 0 ? (
            <CommandGroup
              heading={`${query.trim().length > 0 ? 'Search results' : 'Filtered work items'} · ${searchResults.length}`}
            >
              {searchResults.map((result) => (
                <CommandItem
                  key={result.id}
                  onSelect={() => closeAndRun(() => onSelectItem(result.id))}
                  value={result.id}
                >
                  <Search className="h-4 w-4 shrink-0 text-app-muted" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-medium text-app-text">
                        {result.title}
                      </span>
                      <span className="pill-key border-transparent bg-app-card text-[10px] text-app-text">
                        {result.statusLabel}
                      </span>
                    </div>

                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-app-muted">
                      <span>{result.primaryAgentName ?? 'No assignee'}</span>
                      {result.projectName ? (
                        <span>· {result.projectName}</span>
                      ) : null}
                    </div>

                    <p className="mt-2 text-xs leading-5 text-app-muted">
                      <span className="font-semibold uppercase tracking-[0.18em] text-app-muted">
                        {result.snippetLabel}
                      </span>{' '}
                      {result.snippet}
                    </p>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          ) : (
            <div className="px-4 py-10 text-center text-sm text-app-muted">
              No work items matched the current query and filters.
            </div>
          )
        ) : (
          <>
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
              {items.map((item) => (
                <CommandItem
                  key={item.id}
                  onSelect={() => closeAndRun(() => onSelectItem(item.id))}
                  value={`${item.title} ${item.statusLabel}`}
                >
                  <Sparkles className="h-4 w-4 text-app-muted" />
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate">{item.title}</span>
                    <span className="truncate text-xs text-app-muted">
                      {item.statusLabel}
                    </span>
                  </div>
                  <CommandShortcut>{item.updatedLabel}</CommandShortcut>
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
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}
