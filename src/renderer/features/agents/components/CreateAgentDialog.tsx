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
import type {
  Agent,
  CreateAgentInput,
  DiscoveredExternalChat,
  ExternalChannelsState,
} from '@/renderer/features/agents/types';
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
  existingAgents: Agent[];
  externalChannels: ExternalChannelsState;
  onCreateAgent: (input: CreateAgentInput) => Promise<void>;
  onOpenChange: (open: boolean) => void;
  onOpenChannelsSettings: () => void;
  open: boolean;
  projects: WorkflowProject[];
}

function getChannelBadgeLabel(
  channelId: CreateAgentInput['channelId'],
  externalChannels: ExternalChannelsState,
) {
  if (channelId === builtInChannelOption.id) {
    return 'Default';
  }

  if (channelId === 'telegram') {
    return externalChannels.telegram.configured ? 'External' : 'Setup';
  }

  return 'Soon';
}

function isChannelDisabled(
  channelId: CreateAgentInput['channelId'],
  externalChannels: ExternalChannelsState,
) {
  if (channelId === builtInChannelOption.id) {
    return false;
  }

  if (channelId === 'telegram') {
    return !externalChannels.telegram.configured;
  }

  return true;
}

function getBoundTelegramChatIds(existingAgents: Agent[]) {
  return new Set(
    existingAgents
      .filter((agent) => agent.channel.id === 'telegram')
      .map((agent) => agent.channel.target?.jid)
      .filter((jid): jid is string => Boolean(jid)),
  );
}

function findDiscoveredChat(
  chats: DiscoveredExternalChat[],
  jid: string,
) {
  return chats.find((chat) => chat.jid === jid) ?? null;
}

function formatTelegramBotHandle(botUsername: string | null) {
  return botUsername ? `@${botUsername}` : null;
}

function buildTelegramBotUrl(botUsername: string | null) {
  return botUsername ? `https://t.me/${botUsername}` : null;
}

export function CreateAgentDialog({
  defaultProjectId,
  existingAgents,
  externalChannels,
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
  const [selectedExternalTargetJid, setSelectedExternalTargetJid] = useState('');
  const [value, setValue] = useState('');
  const [selectedChannelId, setSelectedChannelId] = useState<CreateAgentInput['channelId']>(
    builtInChannelOption.id,
  );
  const selectedChannel = getChannelOption(selectedChannelId);
  const boundTelegramChatIds = getBoundTelegramChatIds(existingAgents);
  const discoveredTelegramChats = externalChannels.telegram.discoveredChats;
  const telegramBotHandle = formatTelegramBotHandle(externalChannels.telegram.botUsername);
  const telegramBotUrl = buildTelegramBotUrl(externalChannels.telegram.botUsername);
  const selectedTelegramChat = findDiscoveredChat(
    discoveredTelegramChats,
    selectedExternalTargetJid,
  );
  const hasTelegramSelection =
    selectedChannelId !== 'telegram' ||
    (selectedTelegramChat !== null && !boundTelegramChatIds.has(selectedTelegramChat.jid));

  useEffect(() => {
    if (!open) {
      setValue('');
      setProjectId(defaultProjectId ?? projects[0]?.id ?? '');
      setSelectedExternalTargetJid('');
      setSelectedChannelId(builtInChannelOption.id);
      setChannelPickerOpen(false);
    }
  }, [defaultProjectId, open, projects]);

  useEffect(() => {
    if (selectedChannelId === 'telegram' && !externalChannels.telegram.configured) {
      setSelectedChannelId(builtInChannelOption.id);
      setSelectedExternalTargetJid('');
    }
  }, [externalChannels.telegram.configured, selectedChannelId]);

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

    if (!trimmedValue || !hasTelegramSelection) {
      return;
    }

    await onCreateAgent({
      channelId: selectedChannelId,
      ...(selectedChannelId === 'telegram' && selectedTelegramChat
        ? {
            externalTarget: {
              channelId: 'telegram',
              jid: selectedTelegramChat.jid,
              kind: selectedTelegramChat.kind,
              name: selectedTelegramChat.name,
            },
          }
        : {}),
      name: trimmedValue,
      projectId: projectId || null,
    });
    setValue('');
  };

  const handleOpenTelegramBot = () => {
    if (!telegramBotUrl) {
      return;
    }

    if (typeof window.duneDesktop?.openExternal === 'function') {
      void window.duneDesktop.openExternal(telegramBotUrl);
      return;
    }

    window.open(telegramBotUrl, '_blank', 'noopener,noreferrer');
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
          Create a project-owned agent workspace and choose whether it should live in
          Dune chat or mirror an attached Telegram conversation.
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
                      <span className="pill-key">
                        {getChannelBadgeLabel(selectedChannel.id, externalChannels)}
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
                      const isDisabled = isChannelDisabled(channel.id, externalChannels);

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
                            if (channel.id !== 'telegram') {
                              setSelectedExternalTargetJid('');
                            }
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
                              {getChannelBadgeLabel(channel.id, externalChannels)}
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

            {selectedChannelId === 'telegram' ? (
              <div className="space-y-2 rounded-[18px] border border-app-border bg-app-card/50 p-4">
                <label
                  className="text-[11px] font-semibold uppercase tracking-[0.22em] text-app-muted"
                  htmlFor="create-agent-telegram-chat"
                >
                  Telegram chat
                </label>
                <select
                  className="h-11 w-full rounded-[16px] border border-app-border bg-app-panel px-4 py-2 text-sm text-app-text outline-none transition-colors focus-visible:border-app-border-strong focus-visible:ring-2 focus-visible:ring-app-accent/30"
                  data-testid="telegram-chat-select"
                  id="create-agent-telegram-chat"
                  onChange={(event) => setSelectedExternalTargetJid(event.target.value)}
                  value={selectedExternalTargetJid}
                >
                  <option value="">
                    {discoveredTelegramChats.length > 0
                      ? 'Select a discovered Telegram chat'
                      : 'No Telegram chats discovered yet'}
                  </option>
                  {discoveredTelegramChats.map((chat) => {
                    const isInUse = boundTelegramChatIds.has(chat.jid);

                    return (
                      <option disabled={isInUse} key={chat.jid} value={chat.jid}>
                        {chat.name} · {chat.kind === 'group' ? 'Group' : 'DM'}
                        {isInUse ? ' · In use' : ''}
                      </option>
                    );
                  })}
                </select>
                <p className="text-xs leading-5 text-app-muted">
                  {discoveredTelegramChats.length > 0
                    ? 'The agent will mirror this Telegram conversation into Dune. Replies stay in Telegram.'
                    : telegramBotHandle
                      ? `DM ${telegramBotHandle} once, or add it to a group and mention it once there. This list updates automatically when the bot receives the message.`
                      : 'DM the Telegram bot once, or add it to a group and mention it once there. This list updates automatically when the bot receives the message.'}
                </p>
                {discoveredTelegramChats.length === 0 ? (
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    {telegramBotHandle ? (
                      <Button
                        onClick={handleOpenTelegramBot}
                        size="sm"
                        type="button"
                        variant="outline"
                      >
                        Open bot
                        <ArrowUpRight className="h-4 w-4" />
                      </Button>
                    ) : null}
                    <Button
                      onClick={onOpenChannelsSettings}
                      size="sm"
                      type="button"
                      variant="quiet"
                    >
                      Open Channels settings
                    </Button>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="mt-4 flex items-center justify-between gap-3 border-t border-app-border pt-4">
            <p className="text-[12px] leading-5 text-app-muted">
              {selectedChannelId === 'telegram'
                ? 'Telegram agents mirror chat history here and stay read-only in Dune.'
                : 'Dune chat stays fully writable inside the app.'}
            </p>
            <div className="flex items-center gap-2">
              <Button onClick={() => onOpenChange(false)} type="button" variant="quiet">
                Cancel
              </Button>
              <Button disabled={!value.trim() || !projectId || !hasTelegramSelection} type="submit">
                Create agent
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
