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

interface IndexedMessage {
  index: number;
  message: PresentedAgent['messages'][number];
}

interface IndexedActivityEvent {
  event: AgentActivityEvent;
  index: number;
}

interface SortableTimelineItem {
  item: TimelineItem;
  index: number;
  priority: number;
}

function getMessagePriority(role: PresentedAgent['messages'][number]['role']) {
  switch (role) {
    case 'user':
      return 0;
    case 'system':
      return 1;
    case 'assistant':
    default:
      return 4;
  }
}

function compareMessages(left: IndexedMessage, right: IndexedMessage) {
  if (left.message.createdAt !== right.message.createdAt) {
    return left.message.createdAt - right.message.createdAt;
  }

  const priorityDifference = getMessagePriority(left.message.role) - getMessagePriority(right.message.role);

  if (priorityDifference !== 0) {
    return priorityDifference;
  }

  return left.index - right.index;
}

function compareActivityEvents(left: IndexedActivityEvent, right: IndexedActivityEvent) {
  if (left.event.timestamp !== right.event.timestamp) {
    return left.event.timestamp - right.event.timestamp;
  }

  return left.index - right.index;
}

function compareTimelineItems(left: SortableTimelineItem, right: SortableTimelineItem) {
  if (left.item.timestamp !== right.item.timestamp) {
    return left.item.timestamp - right.item.timestamp;
  }

  if (left.priority !== right.priority) {
    return left.priority - right.priority;
  }

  return left.index - right.index;
}

/** Builds timeline. */
function buildTimeline(agent: PresentedAgent): TimelineItem[] {
  const messages = [...agent.messages]
    .map((message, index) => ({ index, message }))
    .sort(compareMessages)
    .map<SortableTimelineItem>(({ message }, index) => ({
      item: { type: 'message', message, timestamp: message.createdAt },
      index,
      priority: getMessagePriority(message.role),
    }));

  const activities = [...agent.activityEvents]
    .map((event, index) => ({ event, index }))
    .sort(compareActivityEvents)
    .map<SortableTimelineItem>(({ event }, index) => ({
      item: { type: 'activity', events: [event], timestamp: event.timestamp },
      index,
      priority: 2,
    }));

  const engineRuns = groupEngineRuns(
    [...agent.codingEngineEvents].sort((left, right) => left.timestamp - right.timestamp),
  ).map<SortableTimelineItem>((run, index) => ({
    item: {
      type: 'engine',
      run,
      timestamp: run.events[0]?.timestamp ?? Number.MAX_SAFE_INTEGER,
    },
    index,
    priority: 3,
  }));

  return [...messages, ...activities, ...engineRuns]
    .sort(compareTimelineItems)
    .map(({ item }) => item);
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
  const composerHint = `${modifierLabel} Enter to send · Shift Enter for a new line`;

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
            onChange={(event) => onDraftChange(event.target.value)}
            onKeyDown={(event) => {
              void handleComposerKeyDown(event);
            }}
            placeholder="Message agent..."
            ref={composerRef}
            rows={4}
            value={draft}
          />

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-[12px] leading-5 text-app-muted">{composerHint}</p>

            <Button disabled={!draft.trim()} size="sm" type="submit">
              Send
              <ArrowUpRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
