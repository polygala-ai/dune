// Agent timeline inspector view.

import { useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  ExternalLink,
} from 'lucide-react';

import { useAppStore } from '@/renderer/app/store/use-app-store';
import { formatMessageTimestamp } from '@/renderer/features/agents/model/time';
import type {
  AgentActivityEvent,
  PresentedAgent,
} from '@/renderer/features/agents/types';
import type { WorkflowEvent } from '@/renderer/features/workflow/types';
import { cn } from '@/renderer/shared/lib/utils';
import { Button } from '@/renderer/shared/ui/button';

type TimelineEventKind = WorkflowEvent['kind'] | AgentActivityEvent['kind'];

interface TimelineEvent {
  actor?: string;
  description: string;
  detail?: string;
  eventId: string;
  kind: TimelineEventKind;
  itemId?: string;
  itemTitle?: string;
  projectId?: string;
  source: 'activity' | 'workflow';
  timestamp: number;
}

const timelineEventKinds: TimelineEventKind[] = [
  'assignment',
  'feedback',
  'item',
  'note',
  'task',
  'tool',
  'status',
  'subagent',
];

const timelineKindLabels: Record<TimelineEventKind, string> = {
  assignment: 'Assignment',
  feedback: 'Feedback',
  item: 'Item',
  note: 'Note',
  status: 'Status',
  subagent: 'Subagent',
  task: 'Task',
  tool: 'Tool',
};

const detailedTimestampFormatter = new Intl.DateTimeFormat('en', {
  day: 'numeric',
  hour: '2-digit',
  hour12: false,
  minute: '2-digit',
  month: 'short',
  year: 'numeric',
});

/** Parses a local date input value into a timestamp. */
function parseDateInput(value: string, endOfDay = false) {
  if (!value) {
    return null;
  }

  const parts = value.split('-').map((part) => Number(part));

  if (parts.length !== 3) {
    return null;
  }

  const year = parts[0];
  const month = parts[1];
  const day = parts[2];

  if (
    year === undefined
    || month === undefined
    || day === undefined
    || Number.isNaN(year)
    || Number.isNaN(month)
    || Number.isNaN(day)
  ) {
    return null;
  }

  return new Date(
    year,
    month - 1,
    day,
    endOfDay ? 23 : 0,
    endOfDay ? 59 : 0,
    endOfDay ? 59 : 0,
    endOfDay ? 999 : 0,
  ).getTime();
}

/** Returns whether filters are active. */
function hasActiveFilters(
  fromDate: string,
  toDate: string,
  selectedKinds: TimelineEventKind[],
) {
  return Boolean(fromDate || toDate || selectedKinds.length !== timelineEventKinds.length);
}

/** Formats a detailed timeline timestamp. */
function formatDetailedTimestamp(timestamp: number) {
  return detailedTimestampFormatter.format(timestamp);
}

/** Builds export markdown. */
function buildExportMarkdown(
  agentName: string,
  events: TimelineEvent[],
) {
  const lines = [
    `# Agent Timeline: ${agentName}`,
    `_Exported ${formatDetailedTimestamp(Date.now())}_`,
  ];

  for (const event of events) {
    lines.push('');
    lines.push(`## ${formatDetailedTimestamp(event.timestamp)} — ${timelineKindLabels[event.kind]}`);

    if (event.itemTitle) {
      lines.push(`**Work item:** ${event.itemTitle}`);
    }

    if (event.actor) {
      lines.push(`**Actor:** ${event.actor}`);
    }

    lines.push(event.description);

    if (event.detail) {
      lines.push('');
      lines.push(`> ${event.detail.replace(/\n/g, '\n> ')}`);
    }
  }

  return lines.join('\n');
}

/** Renders the agent timeline UI. */
export function AgentTimeline({ agent }: { agent: PresentedAgent }) {
  const items = useAppStore((state) => state.items);
  const [expandedEventIds, setExpandedEventIds] = useState<string[]>([]);
  const [selectedKinds, setSelectedKinds] = useState<TimelineEventKind[]>(timelineEventKinds);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [exportState, setExportState] = useState<'idle' | 'copied' | 'error'>('idle');
  const [exportFeedback, setExportFeedback] = useState<string | null>(null);

  const allEvents = [
    ...items.flatMap((item) => {
      if (item.primaryAgentId !== agent.id) {
        return [];
      }

      return item.workflowEvents.map<TimelineEvent>((event) => ({
        actor: event.actor ?? agent.name,
        description: event.description,
        eventId: `workflow:${event.id}`,
        kind: event.kind,
        itemId: item.id,
        itemTitle: item.title,
        projectId: item.projectId,
        source: 'workflow',
        timestamp: event.createdAt,
      }));
    }),
    ...agent.activityEvents.map<TimelineEvent>((event) => ({
      actor: agent.name,
      description: event.label,
      eventId: `activity:${event.id}`,
      kind: event.kind,
      source: 'activity',
      timestamp: event.timestamp,
      ...(event.detail?.trim()
        ? { detail: event.detail }
        : {}),
    })),
  ].sort((left, right) => {
    if (left.timestamp !== right.timestamp) {
      return right.timestamp - left.timestamp;
    }

    return left.eventId.localeCompare(right.eventId);
  });

  const fromTimestamp = parseDateInput(fromDate);
  const toTimestamp = parseDateInput(toDate, true);
  const filteredEvents = allEvents.filter((event) => {
    if (!selectedKinds.includes(event.kind)) {
      return false;
    }

    if (fromTimestamp !== null && event.timestamp < fromTimestamp) {
      return false;
    }

    if (toTimestamp !== null && event.timestamp > toTimestamp) {
      return false;
    }

    return true;
  });
  const expandedEventIdSet = new Set(expandedEventIds);
  const filtersActive = hasActiveFilters(fromDate, toDate, selectedKinds);

  /** Toggles an event kind filter. */
  const handleToggleKind = (kind: TimelineEventKind) => {
    setSelectedKinds((current) =>
      current.includes(kind)
        ? current.filter((candidate) => candidate !== kind)
        : [...current, kind],
    );
  };

  /** Toggles an expanded event. */
  const handleToggleExpanded = (eventId: string) => {
    setExpandedEventIds((current) =>
      current.includes(eventId)
        ? current.filter((candidate) => candidate !== eventId)
        : [...current, eventId],
    );
  };

  /** Resets timeline filters. */
  const handleResetFilters = () => {
    setFromDate('');
    setToDate('');
    setSelectedKinds(timelineEventKinds);
  };

  /** Opens the linked workflow item. */
  const handleOpenItem = (event: TimelineEvent) => {
    if (!event.itemId || !event.projectId) {
      return;
    }

    const state = useAppStore.getState();
    state.selectProject(event.projectId);
    state.selectItem(event.itemId);
    state.selectProjectView('board');
    state.setRoute('workflow');
  };

  /** Copies the current timeline report. */
  const handleExport = async () => {
    if (filteredEvents.length === 0) {
      return;
    }

    const markdown = buildExportMarkdown(agent.name, filteredEvents);

    try {
      if (typeof window.duneDesktop?.copyText === 'function') {
        await window.duneDesktop.copyText(markdown);
      } else if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(markdown);
      } else {
        throw new Error('Clipboard is unavailable.');
      }

      setExportState('copied');
      setExportFeedback('Markdown report copied to clipboard.');
    } catch (error) {
      setExportState('error');
      setExportFeedback(error instanceof Error ? error.message : 'Failed to copy markdown report.');
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 px-2" data-testid="agent-timeline">
      <section className="rounded-[24px] border border-app-border bg-app-card/60 p-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="surface-eyebrow">Timeline</div>
            <h2 className="mt-2 text-sm font-semibold text-app-text">{agent.name}</h2>
            <p className="mt-2 text-sm leading-6 text-app-muted">
              Every workflow event and runtime activity recorded for this agent, newest first.
            </p>
          </div>

          <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
            <Button
              disabled={filteredEvents.length === 0}
              onClick={() => {
                void handleExport();
              }}
              size="sm"
              type="button"
              variant="outline"
            >
              Export as Markdown
            </Button>
            <span className="pill-key border-transparent bg-app-panel">
              {filteredEvents.length} event{filteredEvents.length === 1 ? '' : 's'}
            </span>
            {exportFeedback ? (
              <p
                className={cn(
                  'text-xs leading-5',
                  exportState === 'error' ? 'text-red-600' : 'text-app-muted',
                )}
              >
                {exportFeedback}
              </p>
            ) : null}
          </div>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,320px)]">
          <div>
            <div className="surface-eyebrow">Event types</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {timelineEventKinds.map((kind) => {
                const isActive = selectedKinds.includes(kind);

                return (
                  <button
                    aria-pressed={isActive}
                    className={cn(
                      'pill-key border transition-colors',
                      isActive
                        ? 'border-transparent bg-app-accent text-white'
                        : 'border-app-border bg-app-panel text-app-muted hover:border-app-border-strong hover:bg-app-card hover:text-app-text',
                    )}
                    key={kind}
                    onClick={() => handleToggleKind(kind)}
                    type="button"
                  >
                    {timelineKindLabels[kind]}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-2">
              <span className="surface-eyebrow">From</span>
              <input
                aria-label="From"
                className="focus-ring-app h-11 w-full rounded-[14px] border border-app-border bg-app-panel px-3 text-sm text-app-text outline-none transition-colors focus-visible:border-app-border-strong focus-visible:ring-2"
                onChange={(event) => setFromDate(event.target.value)}
                type="date"
                value={fromDate}
              />
            </label>
            <label className="space-y-2">
              <span className="surface-eyebrow">To</span>
              <input
                aria-label="To"
                className="focus-ring-app h-11 w-full rounded-[14px] border border-app-border bg-app-panel px-3 text-sm text-app-text outline-none transition-colors focus-visible:border-app-border-strong focus-visible:ring-2"
                onChange={(event) => setToDate(event.target.value)}
                type="date"
                value={toDate}
              />
            </label>
          </div>
        </div>

        {filtersActive ? (
          <div className="mt-4 flex justify-end">
            <Button
              onClick={handleResetFilters}
              size="sm"
              type="button"
              variant="quiet"
            >
              Reset filters
            </Button>
          </div>
        ) : null}
      </section>

      <div className="min-h-0 flex-1">
        {filteredEvents.length === 0 ? (
          <div className="flex h-full items-center justify-center rounded-[24px] border border-dashed border-app-border bg-app-panel/35 px-6 text-center">
            <div>
              <div className="surface-eyebrow">Timeline</div>
              <p className="mt-2 text-sm leading-6 text-app-muted">
                {allEvents.length === 0
                  ? 'No timeline events are recorded yet for this agent.'
                  : 'No timeline events match the current filters.'}
              </p>
            </div>
          </div>
        ) : (
          <div className="thin-scrollbar h-full overflow-y-auto pr-1">
            <div className="space-y-4 pb-1">
              {filteredEvents.map((event, index) => {
                const isExpanded = expandedEventIdSet.has(event.eventId);

                return (
                  <div
                    className="relative pl-6"
                    data-kind={event.kind}
                    data-testid="agent-timeline-event"
                    key={event.eventId}
                  >
                    {index < filteredEvents.length - 1 ? (
                      <div className="absolute bottom-[-1rem] left-1 top-3 w-px bg-app-border" />
                    ) : null}

                    <div className="absolute left-0 top-2.5 flex h-4 w-4 items-center justify-center">
                      <span className="h-2 w-2 rounded-full bg-app-accent/70" />
                    </div>

                    <div className="rounded-[20px] border border-app-border bg-app-card/60 p-4">
                      <button
                        aria-label={`Toggle timeline event ${event.description}`}
                        className="w-full text-left"
                        onClick={() => handleToggleExpanded(event.eventId)}
                        type="button"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="pill-key border-transparent bg-app-panel">
                                {timelineKindLabels[event.kind]}
                              </span>
                              {event.actor ? (
                                <span className="text-xs font-medium text-app-accent">
                                  {event.actor}
                                </span>
                              ) : null}
                            </div>
                            <p className="mt-3 text-sm leading-6 text-app-text">{event.description}</p>
                          </div>

                          <div className="flex shrink-0 items-center gap-2">
                            <span className="pill-key border-transparent bg-app-panel">
                              {formatMessageTimestamp(event.timestamp)}
                            </span>
                            {isExpanded ? (
                              <ChevronDown className="h-4 w-4 text-app-muted" />
                            ) : (
                              <ChevronRight className="h-4 w-4 text-app-muted" />
                            )}
                          </div>
                        </div>
                      </button>

                      {event.itemTitle ? (
                        <div className="mt-3">
                          <button
                            className="rounded-[14px] border border-app-border bg-app-panel px-3 py-1 text-sm text-app-text transition-colors hover:border-app-border-strong hover:bg-app-card"
                            onClick={() => handleOpenItem(event)}
                            type="button"
                          >
                            <span className="inline-flex items-center gap-2">
                              {event.itemTitle}
                              <ExternalLink className="h-3.5 w-3.5 text-app-muted" />
                            </span>
                          </button>
                        </div>
                      ) : null}

                      {isExpanded ? (
                        <div className="mt-4 space-y-3 border-t border-app-border pt-4">
                          {event.detail ? (
                            <pre className="thin-scrollbar max-h-[220px] overflow-auto whitespace-pre-wrap break-words rounded-[16px] border border-app-border bg-app-panel/55 px-3 py-3 font-mono text-[11px] leading-5 text-app-text">
                              {event.detail}
                            </pre>
                          ) : (
                            <div className="rounded-[16px] border border-dashed border-app-border bg-app-panel/35 px-3 py-3 text-sm text-app-muted">
                              No additional detail recorded for this event.
                            </div>
                          )}

                          <div className="grid gap-2 text-xs text-app-muted sm:grid-cols-2">
                            <div>
                              <span className="font-medium text-app-text">Recorded</span>
                              <p className="mt-1">{formatDetailedTimestamp(event.timestamp)}</p>
                            </div>
                            <div>
                              <span className="font-medium text-app-text">Source</span>
                              <p className="mt-1 capitalize">{event.source}</p>
                            </div>
                            <div>
                              <span className="font-medium text-app-text">Event ID</span>
                              <p className="mt-1 break-all font-mono text-[11px]">{event.eventId}</p>
                            </div>
                            {event.itemId ? (
                              <div>
                                <span className="font-medium text-app-text">Item ID</span>
                                <p className="mt-1 break-all font-mono text-[11px]">{event.itemId}</p>
                              </div>
                            ) : null}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
