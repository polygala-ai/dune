import {
  type KeyboardEvent,
  FormEvent,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  ArrowUpRight,
  Check,
  ChevronDown,
} from 'lucide-react';

import {
  builtInChannelOption,
  createAgentChannelOptions,
  getChannelOption,
} from '@/renderer/features/agents/model/channels';
import type { CreateAgentInput } from '@/renderer/features/agents/types';
import type { WorkflowProject } from '@/renderer/features/workflow/types';
import { cn } from '@/renderer/shared/lib/utils';
import { Button } from '@/renderer/shared/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/renderer/shared/ui/dialog';
import { Input } from '@/renderer/shared/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/renderer/shared/ui/popover';
import { Separator } from '@/renderer/shared/ui/separator';

interface CreateAgentDialogProps {
  defaultProjectId: string | null;
  onCreateAgent: (input: CreateAgentInput) => Promise<void>;
  onOpenChange: (open: boolean) => void;
  onOpenChannelsSettings: () => void;
  open: boolean;
  projects: WorkflowProject[];
}

function getChannelBadgeLabel(channelId: CreateAgentInput['channelId']) {
  return channelId === builtInChannelOption.id ? 'Default' : 'Soon';
}

export function CreateAgentDialog({
  defaultProjectId,
  onCreateAgent,
  onOpenChange,
  onOpenChannelsSettings,
  open,
  projects,
}: CreateAgentDialogProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const channelListRef = useRef<HTMLDivElement | null>(null);
  const [isChannelPickerOpen, setChannelPickerOpen] = useState(false);
  const [projectId, setProjectId] = useState(defaultProjectId ?? projects[0]?.id ?? '');
  const [value, setValue] = useState('');
  const [selectedChannelId, setSelectedChannelId] = useState<CreateAgentInput['channelId']>(
    builtInChannelOption.id,
  );
  const selectedChannel = getChannelOption(selectedChannelId);

  useEffect(() => {
    if (!open) {
      setValue('');
      setProjectId(defaultProjectId ?? projects[0]?.id ?? '');
      setSelectedChannelId(builtInChannelOption.id);
      setChannelPickerOpen(false);
    }
  }, [defaultProjectId, open, projects]);

  const focusChannelAction = (direction: 'first' | 'last' | -1 | 1) => {
    const actions = Array.from(
      channelListRef.current?.querySelectorAll<HTMLButtonElement>(
        '[data-channel-action="true"]:not(:disabled)',
      ) ?? [],
    );

    if (actions.length === 0) {
      return;
    }

    if (direction === 'first') {
      actions[0]?.focus();
      return;
    }

    if (direction === 'last') {
      actions[actions.length - 1]?.focus();
      return;
    }

    const currentIndex = actions.findIndex((action) => action === document.activeElement);
    const baseIndex = currentIndex === -1 ? 0 : currentIndex;
    const nextIndex = (baseIndex + direction + actions.length) % actions.length;

    actions[nextIndex]?.focus();
  };

  const handleChannelListKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        focusChannelAction(1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        focusChannelAction(-1);
        break;
      case 'Home':
        event.preventDefault();
        focusChannelAction('first');
        break;
      case 'End':
        event.preventDefault();
        focusChannelAction('last');
        break;
      default:
        break;
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedValue = value.trim();

    if (!trimmedValue) {
      return;
    }

    await onCreateAgent({
      channelId: selectedChannelId,
      name: trimmedValue,
      projectId: projectId || null,
    });
    setValue('');
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent
        className="flex max-h-[min(86vh,720px)] w-[min(92vw,520px)] flex-col"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          inputRef.current?.focus();
        }}
      >
        <DialogTitle>Name the agent</DialogTitle>
        <DialogDescription className="mt-2 leading-6">
          Create a project-owned agent workspace and choose how it should show up in
          Dune. External channels will live in Settings once the real AgentLite wiring lands.
        </DialogDescription>

        <form className="mt-6 flex min-h-0 flex-1 flex-col" onSubmit={handleSubmit}>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
            <div className="space-y-2">
              <label
                className="text-[11px] font-semibold uppercase tracking-[0.22em] text-app-muted"
                htmlFor="create-agent-name"
              >
                Agent name
              </label>
              <Input
                id="create-agent-name"
                onChange={(event) => setValue(event.target.value)}
                placeholder="Release coordinator"
                ref={inputRef}
                value={value}
              />
            </div>

            <div className="space-y-2">
              <label
                className="text-[11px] font-semibold uppercase tracking-[0.22em] text-app-muted"
                htmlFor="create-agent-project"
              >
                Project
              </label>
              <select
                className="h-11 w-full rounded-[16px] border border-app-border bg-app-panel px-4 py-2 text-sm text-app-text outline-none transition-colors focus-visible:border-app-border-strong focus-visible:ring-2 focus-visible:ring-app-accent/30"
                id="create-agent-project"
                onChange={(event) => setProjectId(event.target.value)}
                value={projectId}
              >
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-3">
              <div className="space-y-1">
                <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-app-muted">
                  Channel
                </div>
                <p className="text-xs leading-5 text-app-muted">
                  Choose the default channel for this agent.
                </p>
              </div>

              <Popover onOpenChange={setChannelPickerOpen} open={isChannelPickerOpen}>
                <PopoverTrigger asChild>
                  <button
                    aria-expanded={isChannelPickerOpen}
                    aria-haspopup="dialog"
                    aria-label={`Channel: ${selectedChannel.label}`}
                    className="flex w-full items-center justify-between gap-3 rounded-[18px] border border-app-border bg-app-panel px-4 py-3 text-left transition-colors hover:bg-app-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/25"
                    data-testid="channel-select-trigger"
                    type="button"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-app-text">
                        {selectedChannel.label}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="pill-key">{getChannelBadgeLabel(selectedChannel.id)}</span>
                      <ChevronDown
                        className={cn(
                          'h-4 w-4 text-app-muted transition-transform',
                          isChannelPickerOpen ? 'rotate-180' : 'rotate-0',
                        )}
                      />
                    </div>
                  </button>
                </PopoverTrigger>

                <PopoverContent
                  className="w-[var(--radix-popover-trigger-width)] p-2"
                  data-testid="channel-select-popover"
                  onKeyDown={handleChannelListKeyDown}
                  onOpenAutoFocus={(event) => {
                    event.preventDefault();
                    window.requestAnimationFrame(() => {
                      focusChannelAction('first');
                    });
                  }}
                  ref={channelListRef}
                  sideOffset={10}
                >
                  <div className="space-y-1">
                    {createAgentChannelOptions.map((channel) => {
                      const isSelected = channel.id === selectedChannelId;
                      const isDisabled = channel.id !== builtInChannelOption.id;

                      return (
                        <button
                          aria-label={`Select ${channel.label}`}
                          className={cn(
                            'flex w-full items-start justify-between gap-4 rounded-[16px] px-3 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/25',
                            isDisabled
                              ? 'cursor-not-allowed opacity-60'
                              : isSelected
                                ? 'bg-app-accent-soft text-app-text'
                                : 'hover:bg-app-card text-app-text',
                          )}
                          data-channel-action="true"
                          data-selected={isSelected}
                          disabled={isDisabled}
                          key={channel.id}
                          onClick={() => {
                            setSelectedChannelId(channel.id);
                            setChannelPickerOpen(false);
                          }}
                          type="button"
                        >
                          <div className="min-w-0">
                            <div className="text-sm font-medium text-app-text">
                              {channel.label}
                            </div>
                            <p className="mt-1 text-xs leading-5 text-app-muted">
                              {channel.description}
                            </p>
                          </div>
                          <div className="mt-0.5 flex shrink-0 items-center gap-2">
                            {isSelected && !isDisabled ? (
                              <Check className="h-4 w-4 text-app-accent" />
                            ) : null}
                            <span className="pill-key">
                              {getChannelBadgeLabel(channel.id)}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  <Separator className="my-2" />

                  <button
                    className="flex w-full items-center justify-between rounded-[16px] px-3 py-3 text-left text-sm text-app-text transition-colors hover:bg-app-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/25"
                    data-channel-action="true"
                    onClick={() => {
                      setChannelPickerOpen(false);
                      onOpenChannelsSettings();
                    }}
                    type="button"
                  >
                    <div>
                      <div className="font-medium text-app-text">Open Channels settings</div>
                      <p className="mt-1 text-xs leading-5 text-app-muted">
                        Configure external channels from Settings later.
                      </p>
                    </div>
                    <ArrowUpRight className="h-4 w-4 shrink-0 text-app-muted" />
                  </button>
                </PopoverContent>
              </Popover>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between gap-3 border-t border-app-border pt-4">
            <p className="text-[12px] leading-5 text-app-muted">
              Dune chat is the only active option in this UI pass.
            </p>
            <div className="flex items-center gap-2">
              <Button onClick={() => onOpenChange(false)} type="button" variant="quiet">
                Cancel
              </Button>
              <Button disabled={!value.trim() || !projectId} type="submit">
                Create agent
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
