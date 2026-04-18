// Create agent dialog UI.

import {
  type KeyboardEvent,
  type FormEvent,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  Check,
  ChevronDown,
} from 'lucide-react';

import { useAppStore } from '@/renderer/app/store/use-app-store';
import { AgentCustomizationEditor } from '@/renderer/features/agents/components/AgentCustomizationEditor';
import {
  builtInChannelOption,
  createAgentChannelOptions,
  getChannelBadgeLabel,
  getChannelOption,
  isChannelSelectable,
} from '@/renderer/features/agents/model/channels';
import {
  createEmptyAgentCustomizationDraft,
  getAgentCustomizationSummary,
  hasAgentCustomization,
} from '@/renderer/features/agents/model/agent-customization';
import type {
  Agent,
  CreateAgentInput,
  ExternalChannelsState,
  TelegramSetupSession,
} from '@/renderer/features/agents/types';
import { TelegramChannelSetupCard } from '@/renderer/features/agents/components/TelegramChannelSetupCard';
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

/** Create agent dialog props. */
interface CreateAgentDialogProps {
  defaultProjectId: string | null;
  existingAgents: Agent[];
  externalChannels: ExternalChannelsState;
  onCreateAgent: (input: CreateAgentInput) => Promise<string>;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  projects: WorkflowProject[];
}

/** Renders the create agent dialog UI. */
export function CreateAgentDialog({
  defaultProjectId,
  existingAgents: _existingAgents,
  externalChannels: _externalChannels,
  onCreateAgent,
  onOpenChange,
  open,
  projects,
}: CreateAgentDialogProps) {
  const upsertAgentCustomization = useAppStore((state) => state.upsertAgentCustomization);
  const artifactsPath = useAppStore((state) => state.runtimeInfo.artifactsPath);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const channelListRef = useRef<HTMLDivElement | null>(null);
  const [isChannelPickerOpen, setChannelPickerOpen] = useState(false);
  const [isCustomizationOpen, setCustomizationOpen] = useState(false);
  const [isSubmitting, setSubmitting] = useState(false);
  const [projectId, setProjectId] = useState(defaultProjectId ?? projects[0]?.id ?? '');
  const [value, setValue] = useState('');
  const [customizationDraft, setCustomizationDraft] = useState(createEmptyAgentCustomizationDraft);
  const [selectedChannelId, setSelectedChannelId] = useState<CreateAgentInput['channelId']>(
    builtInChannelOption.id,
  );
  const [telegramSetupSession, setTelegramSetupSession] = useState<TelegramSetupSession | null>(null);
  const selectedChannel = getChannelOption(selectedChannelId);
  const matchedTelegramChat = telegramSetupSession?.matchedChat ?? null;
  const hasTelegramSelection = selectedChannelId !== 'telegram' || matchedTelegramChat !== null;
  const customizationSummary = getAgentCustomizationSummary(customizationDraft);

  useEffect(() => {
    if (!open) {
      setValue('');
      setProjectId(defaultProjectId ?? projects[0]?.id ?? '');
      setSelectedChannelId(builtInChannelOption.id);
      setChannelPickerOpen(false);
      setCustomizationOpen(false);
      setCustomizationDraft(createEmptyAgentCustomizationDraft());
      setSubmitting(false);
      setTelegramSetupSession(null);
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

  /** Handles list key down channel. */
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

  /** Handles submit. */
  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedValue = value.trim();

    if (!trimmedValue || !hasTelegramSelection || isSubmitting) {
      return;
    }

    setSubmitting(true);

    try {
      const agentId = await onCreateAgent({
        channelId: selectedChannelId,
        ...(selectedChannelId === 'telegram' && telegramSetupSession
          ? {
              telegramSetupSessionId: telegramSetupSession.id,
            }
          : {}),
        name: trimmedValue,
        projectId: projectId || null,
        projectName: projects.find((project) => project.id === projectId)?.name ?? null,
        projectRootPath: projects.find((project) => project.id === projectId)?.rootPath ?? null,
      });

      if (hasAgentCustomization(customizationDraft)) {
        upsertAgentCustomization(agentId, customizationDraft);
      }

      setValue('');
      setCustomizationDraft(createEmptyAgentCustomizationDraft());
      setCustomizationOpen(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent
        className="flex max-h-[min(88vh,760px)] w-[min(92vw,640px)] flex-col"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          inputRef.current?.focus();
        }}
      >
        <DialogTitle>Name the agent</DialogTitle>
        <DialogDescription className="mt-2 leading-6">
          Create a project-owned agent workspace and choose which channel it should
          live in. External channel setup now happens here with the agent.
        </DialogDescription>

        <form className="mt-6 flex min-h-0 flex-1 flex-col" onSubmit={handleSubmit}>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-1">
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
                className="focus-ring-app h-11 w-full rounded-[16px] border border-app-border bg-app-panel px-4 py-2 text-sm text-app-text outline-none transition-colors focus-visible:border-app-border-strong focus-visible:ring-2"
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
                  Choose where this agent lives. Telegram setup stays attached to this flow.
                </p>
              </div>

              <Popover onOpenChange={setChannelPickerOpen} open={isChannelPickerOpen}>
                <PopoverTrigger asChild>
                  <button
                    aria-expanded={isChannelPickerOpen}
                    aria-haspopup="dialog"
                    aria-label={`Channel: ${selectedChannel.label}`}
                    className="focus-ring-app flex w-full items-center justify-between gap-3 rounded-[18px] border border-app-border bg-app-panel px-4 py-3 text-left transition-colors hover:bg-app-card focus-visible:outline-none focus-visible:ring-2"
                    data-testid="channel-select-trigger"
                    type="button"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-app-text">
                        {selectedChannel.label}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="pill-key">
                        {getChannelBadgeLabel(selectedChannel.id)}
                      </span>
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
                      const isDisabled = !isChannelSelectable(channel.id);

                      return (
                        <button
                          aria-label={`Select ${channel.label}`}
                          className={cn(
                            'focus-ring-app flex w-full items-start justify-between gap-4 rounded-[16px] px-3 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2',
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
                </PopoverContent>
              </Popover>
            </div>

            {selectedChannelId === 'telegram' ? (
              <TelegramChannelSetupCard
                onSessionChange={setTelegramSetupSession}
              />
            ) : null}

            <div className="rounded-[22px] border border-app-border bg-app-panel/35 px-4 py-4 sm:px-5">
              <button
                aria-expanded={isCustomizationOpen}
                className="focus-ring-app flex w-full items-start justify-between gap-4 rounded-[18px] text-left transition-colors hover:bg-app-card/35 focus-visible:outline-none focus-visible:ring-2"
                onClick={() => setCustomizationOpen((current) => !current)}
                type="button"
              >
                <div className="min-w-0">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-app-muted">
                    Customize agent
                  </div>
                  <h3 className="mt-2 text-base font-semibold tracking-[-0.03em] text-app-text">
                    Instructions, skills, and MCP
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-app-muted">
                    Tune the draft instructions, skill folders, and MCP setup here. Nothing in this panel reaches the runtime yet.
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="inline-flex items-center rounded-full border border-app-border bg-app-card/60 px-3 py-1.5 font-mono text-[11px] text-app-muted">
                    {customizationSummary}
                  </span>
                  <ChevronDown
                    className={cn(
                      'mt-0.5 h-4 w-4 text-app-muted transition-transform',
                      isCustomizationOpen ? 'rotate-180' : 'rotate-0',
                    )}
                  />
                </div>
              </button>

              {isCustomizationOpen ? (
                <>
                  <Separator className="my-4" />
                  <AgentCustomizationEditor
                    agentArchetype="custom"
                    artifactsPath={artifactsPath}
                    value={customizationDraft}
                    onChange={setCustomizationDraft}
                  />
                </>
              ) : null}
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between gap-3 border-t border-app-border pt-4">
            <p className="text-[12px] leading-5 text-app-muted">
              {selectedChannelId === 'telegram'
                ? matchedTelegramChat
                  ? `Telegram pairing matched ${matchedTelegramChat.name}.`
                  : 'Generate a pair code and claim one Telegram chat before creating this agent.'
                : 'Dune chat stays fully writable inside the app.'}
            </p>
            <div className="flex items-center gap-2">
              <Button onClick={() => onOpenChange(false)} type="button" variant="quiet">
                Cancel
              </Button>
              <Button
                disabled={!value.trim() || !projectId || !hasTelegramSelection || isSubmitting}
                type="submit"
              >
                {isSubmitting ? 'Creating...' : 'Create agent'}
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
