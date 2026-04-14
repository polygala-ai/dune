// Agent panel UI.

import { type KeyboardEvent, type RefObject, useState } from 'react';
import { ArrowUpRight } from 'lucide-react';

import { Wrench, Bot, Info } from 'lucide-react';

import { AgentMessageContent } from '@/renderer/features/agents/components/AgentMessageContent';
import { CodingEngineCard, groupEngineRuns } from '@/renderer/features/agents/components/CodingEngineCard';
import type { AgentActivityEvent, PresentedAgent } from '@/renderer/features/agents/types';
import { useDesktopPlatform } from '@/renderer/shared/lib/use-desktop-platform';
import { cn } from '@/renderer/shared/lib/utils';
import { Button } from '@/renderer/shared/ui/button';

/** Agent panel props. */
interface AgentPanelProps {
  agent: PresentedAgent;
  composerRef: RefObject<HTMLTextAreaElement | null>;
  draft: string;
  onDraftChange: (value: string) => void;
  onSubmit: (value: string) => Promise<void>;
  transcriptRef: RefObject<HTMLDivElement | null>;
}

/** Timeline item shape. */
type TimelineItem =
  | { type: 'message'; message: PresentedAgent['messages'][number]; timestamp: number }
  | { type: 'activity'; events: AgentActivityEvent[]; timestamp: number }
  | { type: 'engine'; run: ReturnType<typeof groupEngineRuns>[number]; timestamp: number };

/** Builds timeline. */
function buildTimeline(agent: PresentedAgent): TimelineItem[] {
  const items: TimelineItem[] = [];

  // Pre-build engine runs keyed by start timestamp so we can attach them
  // right after the assistant message whose turn spawned them.
  const engineRuns = groupEngineRuns(agent.codingEngineEvents);

  // Build message pairs: find each assistant message and the activity events
  // that happened during its turn (between the preceding user message and the
  // next user message). Render: user → activity pills → assistant → engine cards.
  const messages = agent.messages;
  const activities = agent.activityEvents;
  let activityIdx = 0;
  let engineIdx = 0;

  for (let i = 0; i < messages.length; i++) {
    const message = messages[i]!;

    // Add user message
    if (message.role === 'user') {
      items.push({ type: 'message', message, timestamp: message.createdAt });
      continue;
    }

    // For assistant messages: insert activity events that happened before this
    // assistant's content was finalized. Use the next message's timestamp as
    // the upper bound, or Infinity if this is the last message.
    const nextMessageTs = messages[i + 1]?.createdAt ?? Infinity;

    while (activityIdx < activities.length) {
      const event = activities[activityIdx]!;
      if (event.timestamp < nextMessageTs) {
        items.push({ type: 'activity', events: [event], timestamp: event.timestamp });
        activityIdx++;
      } else {
        break;
      }
    }

    // Add assistant message after its activity events
    items.push({ type: 'message', message, timestamp: message.createdAt });

    // Attach any engine runs that started during this assistant's turn
    while (engineIdx < engineRuns.length) {
      const run = engineRuns[engineIdx]!;
      const startTs = run.events[0]?.timestamp ?? 0;
      if (startTs < nextMessageTs) {
        items.push({ type: 'engine', run, timestamp: startTs });
        engineIdx++;
      } else {
        break;
      }
    }
  }

  // Any remaining activity events (current turn, not yet finalized)
  while (activityIdx < activities.length) {
    const event = activities[activityIdx]!;
    items.push({ type: 'activity', events: [event], timestamp: event.timestamp });
    activityIdx++;
  }

  // Any remaining engine runs (started during the current unfinalized turn)
  while (engineIdx < engineRuns.length) {
    const run = engineRuns[engineIdx]!;
    const startTs = run.events[0]?.timestamp ?? 0;
    items.push({ type: 'engine', run, timestamp: startTs });
    engineIdx++;
  }

  return items;
}

/** Renders the activity pill UI. */
function ActivityPill({ event }: { event: AgentActivityEvent }) {
  const [open, setOpen] = useState(false);
  const icon = event.kind === 'tool'
    ? <Wrench className="h-3 w-3" />
    : event.kind === 'subagent'
      ? <Bot className="h-3 w-3" />
      : <Info className="h-3 w-3" />;

  return (
    <div className="relative">
      <button
        className="flex items-center gap-1.5 rounded-full border border-app-border bg-app-card/60 px-2.5 py-1 font-mono text-[10px] text-app-muted transition-colors hover:border-app-border-strong hover:bg-app-card/80"
        onClick={() => setOpen(!open)}
        type="button"
      >
        {icon}
        <span className="truncate">{event.label}</span>
      </button>
      {open ? (
        <div className="mt-1.5 max-w-[32rem] overflow-hidden rounded-[14px] border border-app-border bg-app-card/90 shadow-sm">
          <div className="flex items-center gap-2 border-b border-app-border bg-app-panel/40 px-3 py-2">
            {icon}
            <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-app-muted">{event.kind}</span>
            <span className="ml-auto font-mono text-[10px] text-app-muted">{event.label}</span>
          </div>
          {event.detail ? (
            <pre className="max-h-[200px] overflow-auto whitespace-pre-wrap break-words px-3 py-2 font-mono text-[11px] leading-5 text-app-text">
              {event.detail}
            </pre>
          ) : (
            <div className="px-3 py-2 text-[11px] text-app-muted">No additional details</div>
          )}
        </div>
      ) : null}
    </div>
  );
}

/** Roles label. */
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

/** Renders the agent panel UI. */
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

  /** Handles key down composer. */
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

          {buildTimeline(agent).map((item) => {
            if (item.type === 'message') {
              const { message } = item;
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
            }

            if (item.type === 'activity') {
              return (
                <div className="message-reveal flex min-w-0 justify-start" key={item.events[0]?.id}>
                  <div className="flex min-w-0 max-w-[44rem] flex-wrap gap-1.5">
                    {item.events.map((event) => (
                      <ActivityPill event={event} key={event.id} />
                    ))}
                  </div>
                </div>
              );
            }

            return (
              <div className="message-reveal flex min-w-0 justify-start" key={item.run.events[0]?.id}>
                <div className="min-w-0 max-w-[44rem]">
                  <CodingEngineCard run={item.run} />
                </div>
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
