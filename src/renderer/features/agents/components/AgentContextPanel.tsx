import { useState } from 'react';
import {
  PanelRight,
  Trash2,
  X,
} from 'lucide-react';

import { formatChannelStatus } from '@/renderer/features/agents/model/channels';
import { TelegramChannelSetupCard } from '@/renderer/features/agents/components/TelegramChannelSetupCard';
import type { PresentedAgent } from '@/renderer/features/agents/types';
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

interface AgentContextPanelProps {
  agent: PresentedAgent;
  className?: string;
  onClose: () => void;
  onDeleteAgent?: () => Promise<void> | void;
  showCloseButton?: boolean;
}

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

function isSuppressedMockContextCard(card: AgentContextCard) {
  if (card.eyebrow === 'Connection') {
    return (
      card.title === 'Dune chat is attached by default' ||
      card.title.endsWith(' is attached to this agent')
    );
  }

  return card.eyebrow === 'Phase one' && card.title === 'UI first, runtime next';
}

export function AgentContextPanel({
  agent,
  className,
  onClose,
  onDeleteAgent,
  showCloseButton = true,
}: AgentContextPanelProps) {
  const [isDeleteAgentOpen, setDeleteAgentOpen] = useState(false);
  const [isDeletingAgent, setDeletingAgent] = useState(false);
  const visibleContextCards = agent.contextCards
    .filter((card) => !isSuppressedContextCard(card))
    .filter((card) => !isSuppressedMockContextCard(card))
    .slice(0, 2);
  const canDeleteAgent = agent.role === 'custom' && !!onDeleteAgent;

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

  return (
    <>
      <aside
        className={cn(
          'panel-reveal flex min-h-0 flex-col overflow-hidden px-3 pb-4 pt-4',
          className,
        )}
        data-testid="context-panel"
      >
        <div className="px-2 pb-4">
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
              <h3 className="mt-5 truncate text-[13px] font-medium text-app-text">
                {agent.workspace}
              </h3>
              <p className="mt-1 truncate text-[12px] leading-5 text-app-muted">
                {agent.updatedLabel}
              </p>
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
        </div>

        <Separator />

        <div className="mt-6 flex min-h-0 flex-1 flex-col px-1">
          <ScrollArea className="min-h-0 flex-1 pr-1" contentWidth="fill">
            <div className="pr-2">
              <section className="px-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-app-muted">
                  Agent brief
                </div>
                <p className="mt-3 text-sm leading-6 text-app-muted">
                  {agent.note}
                </p>
              </section>

              <Separator className="my-4" />

              <section className="px-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-app-muted">
                  Connection
                </div>
                <div className="mt-3">
                  <div className="flex items-center justify-between gap-4 text-sm">
                    <span className="text-app-muted">Channel</span>
                    <span className="text-right font-medium text-app-text">
                      {agent.channel.label}
                    </span>
                  </div>
                  {agent.channel.target ? (
                    <>
                      <Separator className="my-3" />
                      <div className="flex items-center justify-between gap-4 text-sm">
                        <span className="text-app-muted">Attached chat</span>
                        <span className="text-right font-medium text-app-text">
                          {agent.channel.target.name}
                        </span>
                      </div>
                    </>
                  ) : null}
                  <Separator className="my-3" />
                  <div className="flex items-center justify-between gap-4 text-sm">
                    <span className="text-app-muted">Status</span>
                    <span className="text-right font-medium text-app-text">
                      {formatChannelStatus(agent.channel.status)}
                    </span>
                  </div>
                </div>
              </section>

              {agent.channel.id === 'telegram' ? (
                <>
                  <Separator className="my-4" />
                  <section className="px-3">
                    <TelegramChannelSetupCard agent={agent} />
                  </section>
                </>
              ) : null}

              {visibleContextCards.map((card) => (
                <div key={card.id}>
                  <Separator className="my-4" />
                  <section className="px-3">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-app-muted">
                      {card.eyebrow}
                    </div>
                    <h4 className="mt-3 text-[13px] font-medium text-app-text">
                      {card.title}
                    </h4>
                    <p className="mt-2 text-sm leading-6 text-app-muted">{card.body}</p>
                  </section>
                </div>
              ))}

              {canDeleteAgent ? (
                <>
                  <Separator className="my-4" />
                  <section className="px-3">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-app-muted">
                      Danger zone
                    </div>
                    <div className="mt-3 rounded-[20px] border border-app-border bg-app-panel-strong/80 p-4">
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
                  </section>
                </>
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
