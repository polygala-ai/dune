// Real-time agent activity panel.

import { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

import { useAppStore } from '@/renderer/app/store/use-app-store';
import { cn } from '@/renderer/shared/lib/utils';
import { Button } from '@/renderer/shared/ui/button';
import type { AgentActivityEvent } from '@/renderer/features/agents/types';

const PANEL_OPEN_STORAGE_KEY = 'dune.agent-activity-panel.open';
const STALE_WARNING_MS = 5 * 60_000;
const STALE_ERROR_MS = 15 * 60_000;
const LIVE_ACTIVITY_WINDOW_MS = 15 * 60_000;
const MAX_SUMMARY_LENGTH = 200;

type LiveActivityStatus = 'idle' | 'thinking' | 'tool-calling' | 'waiting';

interface LiveActivitySummary {
  agentId: string;
  agentName: string;
  lastActivity: string;
  lastToolResult: string | null;
  status: LiveActivityStatus;
  timestamp: number;
  workItemTitle: string | null;
}

function readPanelOpenPreference() {
  try {
    const storedValue = window.localStorage.getItem(PANEL_OPEN_STORAGE_KEY);

    if (storedValue === null) {
      return true;
    }

    return storedValue === 'true';
  } catch {
    return true;
  }
}

function formatLastUpdated(updatedAtMs: number, now: number) {
  const ageMs = Math.max(0, now - updatedAtMs);

  if (ageMs < 60_000) {
    return 'just now';
  }

  if (ageMs < 60 * 60_000) {
    return `${Math.floor(ageMs / 60_000)}m ago`;
  }

  if (ageMs < 24 * 60 * 60_000) {
    return `${Math.floor(ageMs / (60 * 60_000))}h ago`;
  }

  return `${Math.floor(ageMs / (24 * 60 * 60_000))}d ago`;
}

function getStatusDotClass(summary: LiveActivitySummary, now: number) {
  const ageMs = Math.max(0, now - summary.timestamp);

  if (ageMs >= STALE_ERROR_MS) {
    return 'bg-red-500';
  }

  if (ageMs >= STALE_WARNING_MS) {
    return 'bg-amber-400';
  }

  if (summary.status === 'thinking') {
    return 'bg-sky-500';
  }

  if (summary.status === 'tool-calling') {
    return 'bg-violet-500';
  }

  if (summary.status === 'waiting') {
    return 'bg-amber-400';
  }

  return 'bg-emerald-500';
}

function getStatusLabel(status: LiveActivityStatus) {
  switch (status) {
    case 'thinking':
      return 'Thinking';
    case 'tool-calling':
      return 'Tool calling';
    case 'waiting':
      return 'Waiting';
    case 'idle':
    default:
      return 'Idle';
  }
}

function getStatusBadgeClass(status: LiveActivityStatus) {
  switch (status) {
    case 'thinking':
      return 'border-sky-500/30 bg-sky-500/10 text-sky-700';
    case 'tool-calling':
      return 'border-violet-500/30 bg-violet-500/10 text-violet-700';
    case 'waiting':
      return 'border-amber-500/30 bg-amber-500/10 text-amber-700';
    case 'idle':
    default:
      return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700';
  }
}

function truncate(value: string, maxLength = MAX_SUMMARY_LENGTH) {
  return value.length > maxLength ? `${value.slice(0, maxLength - 3)}...` : value;
}

function describeEvent(event: AgentActivityEvent) {
  const detail = event.detail?.trim();
  return truncate(detail ? `${event.label} · ${detail}` : event.label);
}

function deriveStatus(event: AgentActivityEvent): LiveActivityStatus {
  if (event.kind === 'tool' && !event.label.startsWith('result:')) {
    return 'tool-calling';
  }

  if (event.kind === 'status' && event.label === 'thinking') {
    return 'thinking';
  }

  if (event.kind === 'status' && event.label === 'waiting') {
    return 'waiting';
  }

  return 'idle';
}

export function AgentActivityPanel() {
  const agents = useAppStore((state) => state.agents);
  const items = useAppStore((state) => state.items);
  const [isOpen, setIsOpen] = useState(() => readPanelOpenPreference());
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    try {
      window.localStorage.setItem(PANEL_OPEN_STORAGE_KEY, String(isOpen));
    } catch {
      // Ignore storage failures in non-browser test environments.
    }
  }, [isOpen]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setNow(Date.now());
    }, 30_000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  const itemTitlesById = new Map(items.map((item) => [item.id, item.title] as const));
  const summaries: LiveActivitySummary[] = agents
    .map((agent) => {
      const recentEvents = agent.activityEvents
        .filter((event) => now - event.timestamp <= LIVE_ACTIVITY_WINDOW_MS)
        .sort((left, right) => right.timestamp - left.timestamp);
      const latestEvent = recentEvents[0];

      if (!latestEvent) {
        return null;
      }

      const latestToolResult = recentEvents.find(
        (event) => event.kind === 'tool' && event.label.startsWith('result:'),
      );

      return {
        agentId: agent.id,
        agentName: agent.name,
        lastActivity: describeEvent(latestEvent),
        lastToolResult: latestToolResult?.detail
          ? truncate(latestToolResult.detail)
          : null,
        status: deriveStatus(latestEvent),
        timestamp: latestEvent.timestamp,
        workItemTitle: agent.workItemId
          ? itemTitlesById.get(agent.workItemId) ?? null
          : null,
      };
    })
    .filter((summary): summary is LiveActivitySummary => summary !== null)
    .sort((left, right) => right.timestamp - left.timestamp);

  return (
    <section
      className="shrink-0 border-t border-app-border bg-app-panel/60"
      data-testid="agent-activity-panel"
    >
      <div className="flex items-center justify-between gap-4 px-6 py-3">
        <div className="min-w-0">
          <div className="surface-eyebrow">Observability</div>
          <div className="mt-1 flex items-center gap-2">
            <h2 className="truncate text-sm font-semibold text-app-text">Agent activity</h2>
            <span className="rounded-full border border-app-border bg-app-card/70 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.12em] text-app-muted">
              {summaries.length}
            </span>
          </div>
        </div>

        <Button
          aria-expanded={isOpen}
          aria-label={isOpen ? 'Hide agent activity' : 'Show agent activity'}
          onClick={() => setIsOpen((currentValue) => !currentValue)}
          size="icon"
          type="button"
          variant="quiet"
        >
          {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
        </Button>
      </div>

      {isOpen ? (
        <div className="max-h-56 overflow-y-auto px-6 pb-4">
          {summaries.length === 0 ? (
            <div className="rounded-[18px] border border-dashed border-app-border bg-app-card/40 px-4 py-4 text-sm text-app-muted">
              No live agent activity yet.
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {summaries.map((summary) => (
                <article
                  className="rounded-[18px] border border-app-border bg-app-card/70 px-4 py-3"
                  key={summary.agentId}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-3">
                      <span
                        aria-hidden="true"
                        className={cn(
                          'mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full',
                          getStatusDotClass(summary, now),
                        )}
                      />
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-app-text">
                          {summary.agentName}
                        </div>
                        <div className="mt-1 text-xs leading-5 text-app-muted">
                          {summary.lastActivity}
                        </div>
                        {summary.workItemTitle ? (
                          <div className="mt-1 text-xs leading-5 text-app-muted">
                            Work item · <span className="text-app-text">{summary.workItemTitle}</span>
                          </div>
                        ) : null}
                        {summary.lastToolResult ? (
                          <div className="mt-1 text-xs leading-5 text-app-muted">
                            Result: <span className="text-app-text">{summary.lastToolResult}</span>
                          </div>
                        ) : null}
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-app-muted">
                          <span
                            className={cn(
                              'rounded-full border px-2 py-0.5 font-medium',
                              getStatusBadgeClass(summary.status),
                            )}
                          >
                            {getStatusLabel(summary.status)}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="shrink-0 text-[11px] text-app-muted">
                      {formatLastUpdated(summary.timestamp, now)}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}
