import { type KeyboardEvent, type RefObject } from 'react';
import { ArrowUpRight } from 'lucide-react';

import { AgentMessageContent } from '@/renderer/features/agents/components/AgentMessageContent';
import type { PresentedAgent } from '@/renderer/features/agents/types';
import { useDesktopPlatform } from '@/renderer/shared/lib/use-desktop-platform';
import { cn } from '@/renderer/shared/lib/utils';
import { Button } from '@/renderer/shared/ui/button';

interface AgentPanelProps {
  agent: PresentedAgent;
  composerRef: RefObject<HTMLTextAreaElement | null>;
  draft: string;
  onDraftChange: (value: string) => void;
  onSubmit: (value: string) => Promise<void>;
  transcriptRef: RefObject<HTMLDivElement | null>;
}

function roleLabel(role: PresentedAgent['messages'][number]['role']) {
  switch (role) {
    case 'assistant':
      return 'Agent';
    case 'user':
      return 'You';
    default:
      return 'System';
  }
}

export function AgentPanel({
  agent,
  composerRef,
  draft,
  onDraftChange,
  onSubmit,
  transcriptRef,
}: AgentPanelProps) {
  const { modifierLabel } = useDesktopPlatform();
  const attachedLabel = agent.channel.target?.name ?? agent.channel.label;
  const isAgentStreaming = agent.status === 'live';
  const isComposerDisabled = isAgentStreaming || !agent.channel.canCompose;
  const composerHint = agent.channel.canCompose
    ? `${modifierLabel} Enter to send · Shift Enter for a new line`
    : `This agent is attached to ${attachedLabel}. Reply in the source channel.`;
  const composerPlaceholder = agent.channel.canCompose
    ? 'Message agent...'
    : `Attached to ${attachedLabel}`;

  const handleComposerKeyDown = async (
    event: KeyboardEvent<HTMLTextAreaElement>,
  ) => {
    const isPrimaryModifier = modifierLabel === '⌘' ? event.metaKey : event.ctrlKey;

    if (event.key === 'Enter' && isPrimaryModifier) {
      event.preventDefault();
      await onSubmit(draft);
    }
  };

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
      <div
        className="agent-panel-scroll thin-scrollbar flex-1 min-h-0 overflow-y-auto px-8 pb-6 pt-8"
        ref={transcriptRef}
      >
        <div className="mx-auto flex min-w-0 max-w-3xl flex-col gap-3">
          <div className="agent-panel-header mb-3 border-b border-app-border pb-4">
            <h2 className="truncate text-[1.35rem] font-semibold tracking-[-0.04em] text-app-text">
              {agent.name}
            </h2>
          </div>

          {agent.messages.map((message) => {
            const isUser = message.role === 'user';

            return (
              <div
                className={cn(
                  'message-reveal flex min-w-0',
                  isUser ? 'justify-end' : 'justify-start',
                )}
                key={message.id}
              >
                <article
                  className={cn(
                    'min-w-0 max-w-[44rem]',
                    isUser ? 'rounded-[18px] bg-app-accent-soft px-4 py-3' : 'px-1 py-1',
                  )}
                >
                  <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-app-muted">
                    <span>{roleLabel(message.role)}</span>
                    <span className="h-1 w-1 rounded-full bg-app-border-strong" />
                    <span>{message.createdAtLabel}</span>
                    {message.status === 'streaming' ? (
                      <>
                        <span className="h-1 w-1 rounded-full bg-app-border-strong" />
                        <span className="streaming-dot rounded-full text-app-accent">
                          Streaming
                        </span>
                      </>
                    ) : null}
                  </div>
                  <AgentMessageContent message={message} />
                </article>
              </div>
            );
          })}
        </div>
      </div>

      <form
        className="shrink-0 border-t border-app-border px-8 py-4"
        onSubmit={(event) => {
          event.preventDefault();
          void onSubmit(draft);
        }}
      >
        <div className="mx-auto max-w-3xl">
          <textarea
            aria-label="Agent composer"
            className="min-h-[84px] w-full bg-transparent px-1 text-[14px] leading-7 text-app-text outline-none placeholder:text-app-muted"
            disabled={isComposerDisabled}
            onChange={(event) => onDraftChange(event.target.value)}
            onKeyDown={(event) => {
              void handleComposerKeyDown(event);
            }}
            placeholder={composerPlaceholder}
            ref={composerRef}
            rows={4}
            value={draft}
          />

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-[12px] leading-5 text-app-muted">{composerHint}</p>

            <Button disabled={!draft.trim() || isComposerDisabled} size="sm" type="submit">
              {isAgentStreaming ? 'Streaming…' : 'Send'}
              <ArrowUpRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
