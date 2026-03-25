import { startTransition } from 'react';
import {
  MessageSquareDot,
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

interface CommandConversation {
  id: string;
  preview: string;
  title: string;
  updatedLabel: string;
  workspace: string;
}

interface CommandMenuProps {
  conversations: CommandConversation[];
  isContextPanelOpen: boolean;
  onCreateConversation: () => void;
  onOpenChange: (open: boolean) => void;
  onOpenSettings: () => void;
  onSelectConversation: (conversationId: string) => void;
  onToggleContextPanel: () => void;
  open: boolean;
}

export function CommandMenu({
  conversations,
  isContextPanelOpen,
  onCreateConversation,
  onOpenChange,
  onOpenSettings,
  onSelectConversation,
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
      <CommandInput placeholder="Jump to a thread or action…" />
      <CommandList className="thin-scrollbar">
        <CommandEmpty>No matching threads or actions.</CommandEmpty>
        <CommandGroup heading="Actions">
          <CommandItem onSelect={() => closeAndRun(onCreateConversation)}>
            <Plus className="h-4 w-4 text-app-muted" />
            <span className="flex-1 truncate">New chat</span>
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

        <CommandGroup heading="Conversations">
          {conversations.map((conversation) => (
            <CommandItem
              key={conversation.id}
              onSelect={() => closeAndRun(() => onSelectConversation(conversation.id))}
              value={`${conversation.title} ${conversation.preview} ${conversation.workspace}`}
            >
              <MessageSquareDot className="h-4 w-4 text-app-muted" />
              <div className="flex min-w-0 flex-col">
                <span className="truncate">{conversation.title}</span>
                <span className="truncate text-xs text-app-muted">
                  {conversation.workspace}
                </span>
              </div>
              <CommandShortcut>{conversation.updatedLabel}</CommandShortcut>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
