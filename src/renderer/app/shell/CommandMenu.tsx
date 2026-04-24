// Command menu UI.

import {
  startTransition,
  useMemo,
  useState,
} from 'react';
import {
  Bot,
  FileText,
  PanelRight,
  Plus,
  Settings2,
  Sparkles,
} from 'lucide-react';

import type { SearchIndex } from '@/renderer/features/workflow/model/search-index';
import { useDesktopPlatform } from '@/renderer/shared/lib/use-desktop-platform';
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
  searchIndex: SearchIndex;
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
  searchIndex,
}: CommandMenuProps) {
  const { modifierLabel } = useDesktopPlatform();
  const [query, setQuery] = useState('');
  const searchResults = useMemo(
    () => searchIndex.search(query, 10),
    [query, searchIndex],
  );
  const isSearching = query.trim().length > 0;

  const closeAndRun = (handler: () => void) => {
    onOpenChange(false);
    setQuery('');
    startTransition(() => {
      handler();
    });
  };

  return (
    <CommandDialog
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          setQuery('');
        }

        onOpenChange(nextOpen);
      }}
      open={open}
    >
      <CommandInput
        onValueChange={setQuery}
        placeholder="Search work items, projects, agents, or actions..."
        value={query}
      />
      <CommandList className="thin-scrollbar">
        <CommandEmpty>No matching projects, work items, or actions.</CommandEmpty>
        {isSearching ? (
          <>
            <CommandGroup heading="Work item matches">
              {searchResults.map((item) => (
                <CommandItem
                  key={item.itemId}
                  onSelect={() => closeAndRun(() => onSelectItem(item.itemId))}
                  value={`${item.title} ${item.statusLabel} ${item.assigneeName ?? ''} ${item.snippet}`}
                >
                  <FileText className="h-4 w-4 text-app-muted" />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate">{item.title}</span>
                    <span className="truncate text-xs text-app-muted">
                      {item.statusLabel} · {item.assigneeName ?? 'No agent'} · {item.projectName}
                    </span>
                    <span className="mt-1 line-clamp-2 text-xs leading-5 text-app-muted">
                      {item.snippet}
                    </span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>

            <CommandSeparator />
          </>
        ) : null}

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
      </CommandList>
    </CommandDialog>
  );
}
