import { startTransition } from 'react';
import {
  Bot,
  PanelRight,
  Plus,
  Settings2,
} from 'lucide-react';

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

interface CommandAgent {
  id: string;
  name: string;
  preview: string;
  updatedLabel: string;
  workspace: string;
}

interface CommandMenuProps {
  agents: CommandAgent[];
  isContextPanelOpen: boolean;
  onCreateAgent: () => void;
  onOpenChange: (open: boolean) => void;
  onOpenSettings: () => void;
  onSelectAgent: (agentId: string) => void;
  onToggleContextPanel: () => void;
  open: boolean;
}

export function CommandMenu({
  agents,
  isContextPanelOpen,
  onCreateAgent,
  onOpenChange,
  onOpenSettings,
  onSelectAgent,
  onToggleContextPanel,
  open,
}: CommandMenuProps) {
  const { modifierLabel } = useDesktopPlatform();

  const closeAndRun = (handler: () => void) => {
    onOpenChange(false);
    startTransition(() => {
      handler();
    });
  };

  return (
    <CommandDialog onOpenChange={onOpenChange} open={open}>
      <CommandInput placeholder="Jump to an agent or action…" />
      <CommandList className="thin-scrollbar">
        <CommandEmpty>No matching agents or actions.</CommandEmpty>
        <CommandGroup heading="Actions">
          <CommandItem onSelect={() => closeAndRun(onCreateAgent)}>
            <Plus className="h-4 w-4 text-app-muted" />
            <span className="flex-1 truncate">New agent</span>
            <CommandShortcut>{modifierLabel}N</CommandShortcut>
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

        <CommandGroup heading="Agents">
          {agents.map((agent) => (
            <CommandItem
              key={agent.id}
              onSelect={() => closeAndRun(() => onSelectAgent(agent.id))}
              value={`${agent.name} ${agent.preview} ${agent.workspace}`}
            >
              <Bot className="h-4 w-4 text-app-muted" />
              <div className="flex min-w-0 flex-col">
                <span className="truncate">{agent.name}</span>
                <span className="truncate text-xs text-app-muted">
                  {agent.workspace}
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
