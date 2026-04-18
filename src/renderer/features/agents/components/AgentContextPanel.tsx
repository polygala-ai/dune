// Agent context panel UI.

import {
  type ReactNode,
  useEffect,
  useState,
} from 'react';
import {
  PanelRight,
  Trash2,
  X,
} from 'lucide-react';

import {
  countConfiguredMcpServers,
  countConfiguredSkills,
  type AgentCustomizationDraft,
  hasAgentCustomization,
} from '@/renderer/features/agents/model/agent-customization';
import {
  createAgentChannelOptions,
  formatChannelStatus,
  getChannelBadgeLabel,
  getChannelOption,
  isChannelSelectable,
} from '@/renderer/features/agents/model/channels';
import type {
  CodingEngineStatus,
  PresentedAgent,
  TelegramSetupSession,
  UpdateAgentChannelInput,
} from '@/renderer/features/agents/types';
import { cn } from '@/renderer/shared/lib/utils';
import { Button } from '@/renderer/shared/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/renderer/shared/ui/dialog';
import { ScrollArea } from '@/renderer/shared/ui/scroll-area';
import { Separator } from '@/renderer/shared/ui/separator';
import type { AgentContextCard } from '@/renderer/features/agents/types';

/** Agent context panel props. */
interface AgentContextPanelProps {
  agent: PresentedAgent;
  className?: string;
  codingEngines?: CodingEngineStatus[];
  customization?: AgentCustomizationDraft | null;
  onClose: () => void;
  onDeleteAgent?: () => Promise<void> | void;
  onEditCustomization?: () => void;
  showCloseButton?: boolean;
  onOpenTelegramSetup?: () => void;
  telegramSetupSession?: TelegramSetupSession | null;
  onUpdateChannel?: (
    input: Pick<UpdateAgentChannelInput, 'channelId' | 'telegramSetupSessionId'>,
  ) => Promise<void> | void;
}

/** Returns whether the card is a suppressed context card. */
function isSuppressedContextCard(card: AgentContextCard) {
  if (card.eyebrow === 'Bridge' && card.title === 'Desktop-managed runtime') {
    return true;
  }

  if (card.eyebrow !== 'Runtime') {
    return false;
  }

  return (
    card.title === 'AgentLite is driving this workspace' ||
    card.title.endsWith(' is backed by AgentLite')
  );
}

/** Returns whether the card is a suppressed mock context card. */
function isSuppressedMockContextCard(card: AgentContextCard) {
  if (card.eyebrow === 'Connection') {
    return (
      card.title === 'Dune chat is attached by default' ||
      card.title.endsWith(' is attached to this agent')
    );
  }

  return card.eyebrow === 'Phase one' && card.title === 'UI first, runtime next';
}

/** Returns agent archetype label. */
function getAgentArchetypeLabel(archetype: PresentedAgent['definition']['archetype']) {
  return archetype === 'project-main' ? 'Project main' : 'Custom agent';
}

/** Inspector section props. */
interface InspectorSectionProps {
  eyebrow: string;
  children: ReactNode;
}

/** Renders the inspector section UI. */
function InspectorSection({ eyebrow, children }: InspectorSectionProps) {
  return (
    <section className="space-y-3">
      <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-app-muted">
        {eyebrow}
      </div>
      {children}
    </section>
  );
}

/** Inspector card props. */
interface InspectorCardProps {
  children: ReactNode;
}

/** Renders the inspector card UI. */
function InspectorCard({ children }: InspectorCardProps) {
  return (
    <div className="rounded-[22px] border border-app-border bg-app-card/60 p-4">
      {children}
    </div>
  );
}

/** Inspector inset props. */
interface InspectorInsetProps {
  children: ReactNode;
  className?: string;
}

/** Renders the inspector inset UI. */
function InspectorInset({ children, className }: InspectorInsetProps) {
  return (
    <div className={cn('mt-3 rounded-[16px] border border-app-border bg-app-panel/60 px-3 py-2', className)}>
      {children}
    </div>
  );
}

/** Inspector row props. */
interface InspectorRowProps {
  label: string;
  value: ReactNode;
  valueClassName?: string;
}

/** Renders the inspector row UI. */
function InspectorRow({
  label,
  value,
  valueClassName,
}: InspectorRowProps) {
  return (
    <div className="flex items-start justify-between gap-4 text-sm">
      <div className="text-app-muted">
        {label}
      </div>
      <div className={cn('max-w-[60%] text-right font-medium text-app-text', valueClassName)}>
        {value}
      </div>
    </div>
  );
}

/** Renders the customization metric row UI. */
function CustomizationMetricRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <div className="text-app-muted">
        {label}
      </div>
      <div className="shrink-0 rounded-full border border-app-border bg-app-panel/70 px-2.5 py-1 font-mono text-[11px] text-app-muted">
        {value}
      </div>
    </div>
  );
}

/** Renders the agent context panel UI. */
export function AgentContextPanel({
  agent,
  className,
  codingEngines = [],
  customization = null,
  onClose,
  onDeleteAgent,
  onEditCustomization,
  showCloseButton = true,
  onOpenTelegramSetup,
  telegramSetupSession = null,
  onUpdateChannel,
}: AgentContextPanelProps) {
  const [channelDraftId, setChannelDraftId] = useState(agent.channel.id);
  const [channelError, setChannelError] = useState<string | null>(null);
  const [isUpdatingChannel, setUpdatingChannel] = useState(false);
  const [isDeleteAgentOpen, setDeleteAgentOpen] = useState(false);
  const [isDeletingAgent, setDeletingAgent] = useState(false);
  const channelStatusLabel = formatChannelStatus(agent.channel.status);
  const visibleContextCards = agent.contextCards
    .filter((card) => !isSuppressedContextCard(card))
    .filter((card) => !isSuppressedMockContextCard(card))
    .slice(0, 2);
  const canDeleteAgent = agent.definition.archetype === 'custom' && !!onDeleteAgent;
  const hasCustomization = hasAgentCustomization(customization);
  const skillCount = customization ? countConfiguredSkills(customization.skills) : 0;
  const mcpCount = customization ? countConfiguredMcpServers(customization.mcpServers) : 0;
  const instructionsLabel = customization?.additionalInstructions.trim() ? 'Added' : 'Inherited';
  const selectedChannel = getChannelOption(channelDraftId);
  const hasPendingChannelChange = channelDraftId !== agent.channel.id;
  const isTelegramDraftSelected = channelDraftId === 'telegram';
  const matchedTelegramChat = telegramSetupSession?.matchedChat ?? null;
  const canSaveChannel = Boolean(
    onUpdateChannel
    && hasPendingChannelChange
    && !isUpdatingChannel
    && (
      channelDraftId !== 'telegram'
      || matchedTelegramChat
    ),
  );

  useEffect(() => {
    setChannelDraftId(agent.channel.id);
    setChannelError(null);
    setUpdatingChannel(false);
  }, [agent.channel.id, agent.id]);

  /** Handles agent deletion. */
  const handleDeleteAgent = async () => {
    if (!onDeleteAgent || isDeletingAgent) {
      return;
    }

    setDeletingAgent(true);

    try {
      await onDeleteAgent();
      setDeleteAgentOpen(false);
    } finally {
      setDeletingAgent(false);
    }
  };

  /** Handles channel save. */
  const handleSaveChannel = async () => {
    if (!onUpdateChannel || !hasPendingChannelChange || isUpdatingChannel) {
      return;
    }

    if (channelDraftId === 'telegram' && !matchedTelegramChat) {
      return;
    }

    setUpdatingChannel(true);
    setChannelError(null);

    try {
      await onUpdateChannel({
        channelId: channelDraftId,
        ...(channelDraftId === 'telegram' && telegramSetupSession
          ? { telegramSetupSessionId: telegramSetupSession.id }
          : {}),
      });
    } catch (error) {
      setChannelError(String(error));
    } finally {
      setUpdatingChannel(false);
    }
  };

  return (
    <>
      <aside
        className={cn(
          'panel-reveal flex min-h-0 flex-col overflow-hidden px-3 pb-4 pt-4',
          className,
        )}
        data-testid="context-panel"
      >
        <div className="px-2">
          <div
            className={cn(
              'flex items-start gap-3',
              showCloseButton && 'justify-between',
            )}
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.26em] text-app-muted">
                <PanelRight className="h-3 w-3" />
                Inspector
              </div>
            </div>

            {showCloseButton ? (
              <Button
                aria-label="Close context panel"
                className="shrink-0"
                onClick={onClose}
                size="icon"
                variant="quiet"
              >
                <X className="h-4 w-4" />
              </Button>
            ) : null}
          </div>
          <div className="mt-6">
            <InspectorCard>
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-app-muted">
                <span>{getAgentArchetypeLabel(agent.definition.archetype)}</span>
                <span className="h-1 w-1 rounded-full bg-app-border-strong" />
                <span>{agent.statusLabel}</span>
              </div>
              <InspectorInset>
                <InspectorRow label="Agent name" value={agent.name} />
                <Separator className="my-3" />
                <InspectorRow
                  label="Agent ID"
                  value={agent.id}
                  valueClassName="break-all font-mono text-[12px] leading-6"
                />
              </InspectorInset>
            </InspectorCard>
          </div>
        </div>

        <div className="mt-6 flex min-h-0 flex-1 flex-col">
          <ScrollArea className="min-h-0 flex-1" contentWidth="fill">
            <div className="space-y-4 px-2">
              <section>
                <InspectorCard>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-app-muted">
                    Connection
                  </div>
                  <InspectorInset>
                    <InspectorRow label="Channel" value={agent.channel.label} />
                    {agent.channel.target ? (
                      <>
                        <Separator className="my-3" />
                        <InspectorRow label="Attached chat" value={agent.channel.target.name} />
                      </>
                    ) : null}
                    <Separator className="my-3" />
                    <InspectorRow label="Status" value={channelStatusLabel} />

                    {onUpdateChannel ? (
                      <>
                        <Separator className="my-3" />
                        <div className="space-y-2">
                          <label
                            className="text-[11px] font-semibold uppercase tracking-[0.22em] text-app-muted"
                            htmlFor={`agent-channel-select-${agent.id}`}
                          >
                            Change channel
                          </label>
                          <select
                            className="focus-ring-app h-11 w-full rounded-[14px] border border-app-border bg-app-panel px-3 py-2 text-sm text-app-text outline-none transition-colors focus-visible:border-app-border-strong focus-visible:ring-2"
                            disabled={isUpdatingChannel}
                            id={`agent-channel-select-${agent.id}`}
                            onChange={(event) => {
                              const nextChannelId = event.target.value as typeof channelDraftId;
                              setChannelDraftId(nextChannelId);
                              setChannelError(null);
                              if (
                                nextChannelId === 'telegram'
                                && !matchedTelegramChat
                              ) {
                                onOpenTelegramSetup?.();
                              }
                            }}
                            value={channelDraftId}
                          >
                            {createAgentChannelOptions.map((channel) => (
                              <option
                                disabled={!isChannelSelectable(channel.id)}
                                key={channel.id}
                                value={channel.id}
                              >
                                {`${channel.label} · ${getChannelBadgeLabel(channel.id)}`}
                              </option>
                            ))}
                          </select>
                          <p className="text-xs leading-5 text-app-muted">
                            {hasPendingChannelChange
                              ? channelDraftId === 'telegram'
                                ? matchedTelegramChat
                                  ? `Telegram is paired with ${matchedTelegramChat.name}. Save it from the popup.`
                                  : `Open ${selectedChannel.label} setup in a popup to finish pairing and save there.`
                                : `Save to move this agent back into ${selectedChannel.label}.`
                              : agent.channel.id === 'telegram'
                                ? 'Use the popup to re-pair or update this Telegram binding.'
                                : 'Channel changes apply to the live agent workspace.'}
                          </p>
                          {isTelegramDraftSelected && matchedTelegramChat ? (
                            <p className="text-xs leading-5 text-app-text">
                              Matched chat ready: {matchedTelegramChat.name}
                            </p>
                          ) : null}
                          {channelError ? (
                            <p className="text-xs leading-5 text-red-600">
                              {channelError}
                            </p>
                          ) : null}
                        </div>
                      </>
                    ) : null}
                  </InspectorInset>

                  {onOpenTelegramSetup && (isTelegramDraftSelected || agent.channel.id === 'telegram') ? (
                    <Button
                      className="mt-3 w-full"
                      onClick={onOpenTelegramSetup}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      {isTelegramDraftSelected
                        ? matchedTelegramChat
                          ? 'Review Telegram setup'
                          : 'Open Telegram setup'
                        : 'Manage Telegram setup'}
                    </Button>
                  ) : null}

                  {onUpdateChannel && hasPendingChannelChange ? (
                    <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
                      <Button
                        disabled={isUpdatingChannel}
                        onClick={() => {
                          setChannelDraftId(agent.channel.id);
                          setChannelError(null);
                        }}
                        size="sm"
                        type="button"
                        variant="quiet"
                      >
                        Reset
                      </Button>
                      <Button
                        disabled={!canSaveChannel}
                        onClick={() => {
                          void handleSaveChannel();
                        }}
                        size="sm"
                        type="button"
                      >
                        {isUpdatingChannel
                          ? 'Saving…'
                          : channelDraftId === 'telegram'
                            ? 'Save Telegram channel'
                            : 'Save channel'}
                      </Button>
                    </div>
                  ) : null}
                </InspectorCard>
              </section>

              <section>
                <InspectorCard>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-app-muted">
                    Customization
                  </div>

                  <InspectorInset className="space-y-4">
                    <div className="space-y-1.5">
                      <p className="text-sm font-medium text-app-text">
                        {hasCustomization ? 'Session draft active' : 'Inherited defaults'}
                      </p>
                      <p className="text-xs leading-5 text-app-muted">
                        {hasCustomization
                          ? 'Saved locally in renderer memory for this session.'
                          : 'No local draft is attached to this agent yet.'}
                      </p>
                    </div>

                    <div className="space-y-2.5">
                      <CustomizationMetricRow
                        label="Instructions"
                        value={instructionsLabel}
                      />
                      <CustomizationMetricRow
                        label="Skills"
                        value={skillCount > 0 ? String(skillCount) : 'None'}
                      />
                      <CustomizationMetricRow
                        label="MCP"
                        value={mcpCount > 0 ? String(mcpCount) : 'None'}
                      />
                    </div>
                  </InspectorInset>

                  {onEditCustomization ? (
                    <Button
                      className="mt-3 w-full"
                      onClick={onEditCustomization}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      Edit customization
                    </Button>
                  ) : null}
                </InspectorCard>
              </section>

              {codingEngines.length > 0 ? (
                <section>
                  <InspectorCard>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-app-muted">
                      Coding Engines
                    </div>

                    <InspectorInset className="space-y-2.5">
                      {codingEngines.map((engine) => (
                        <CustomizationMetricRow
                          key={engine.id}
                          label={engine.label}
                          value={engine.available ? (engine.version ?? 'found') : 'Not found'}
                        />
                      ))}
                    </InspectorInset>
                  </InspectorCard>
                </section>
              ) : null}

              {visibleContextCards.map((card) => (
                <InspectorSection eyebrow={card.eyebrow} key={card.id}>
                  <div className="rounded-[20px] border border-app-border bg-app-card/60 p-4">
                    <h4 className="text-[13px] font-medium text-app-text">{card.title}</h4>
                    <p className="mt-2 text-sm leading-6 text-app-muted">{card.body}</p>
                  </div>
                </InspectorSection>
              ))}

              {canDeleteAgent ? (
                <InspectorSection eyebrow="Danger zone">
                  <div className="rounded-[20px] border border-app-border bg-app-panel-strong/80 p-4">
                    <p className="text-sm font-medium text-app-text">Delete this agent</p>
                    <p className="mt-2 text-sm leading-6 text-app-muted">
                      Remove this agent workspace and clear any work item assignments that point
                      to it.
                    </p>
                    <Button
                      className="mt-4 border-red-300/60 text-red-700 hover:border-red-400 hover:bg-red-50"
                      onClick={() => setDeleteAgentOpen(true)}
                      type="button"
                      variant="outline"
                    >
                      <Trash2 className="h-4 w-4" />
                      Delete agent
                    </Button>
                  </div>
                </InspectorSection>
              ) : null}
            </div>
          </ScrollArea>
        </div>
      </aside>

      <Dialog onOpenChange={setDeleteAgentOpen} open={isDeleteAgentOpen}>
        <DialogContent className="w-[min(92vw,520px)]">
          <DialogTitle>
            Delete {agent.name}?
          </DialogTitle>
          <DialogDescription className="mt-2 leading-6">
            This will permanently delete the agent workspace. Any primary work item assignments
            pointing at this agent will be cleared.
          </DialogDescription>

          <div className="mt-6 flex items-center justify-end gap-2">
            <Button
              onClick={() => setDeleteAgentOpen(false)}
              type="button"
              variant="ghost"
            >
              Cancel
            </Button>
            <Button
              className="bg-red-700 text-white hover:bg-red-800"
              data-testid="confirm-delete-agent-button"
              disabled={isDeletingAgent}
              onClick={() => {
                void handleDeleteAgent();
              }}
              type="button"
            >
              {isDeletingAgent ? 'Deleting…' : 'Delete agent'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
