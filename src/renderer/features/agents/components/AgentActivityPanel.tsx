// Real-time agent activity panel.

import { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

import { useAppStore } from '@/renderer/app/store/use-app-store';
import { cn } from '@/renderer/shared/lib/utils';
import { Button } from '@/renderer/shared/ui/button';
import type { AgentActivityStatus } from '@/shared/agents/agent-activity';

const PANEL_OPEN_STORAGE_KEY = 'dune.agent-activity-panel.open';
const STALE_WARNING_MS = 5 * 60_000;
const STALE_ERROR_MS = 15 * 60_000;

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

function formatLastUpdated(updatedAt: string, now: number) {
  const updatedAtMs = Date.parse(updatedAt);

  if (!Number.isFinite(updatedAtMs)) {
    return 'Unknown';
  }

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

function getStatusDotClass(status: AgentActivityStatus, now: number) {
  const updatedAtMs = Date.parse(status.updatedAt);
  const ageMs = Number.isFinite(updatedAtMs) ? Math.max(0, now - updatedAtMs) : Number.POSITIVE_INFINITY;

  if (status.status === 'error' || status.status === 'done' || ageMs >= STALE_ERROR_MS) {
    return 'bg-red-500';
  }

  if (ageMs >= STALE_WARNING_MS) {
    return 'bg-amber-400';
  }

  if (status.status === 'thinking') {
    return 'bg-sky-500';
  }

  if (status.status === 'tool-calling') {
    return 'bg-violet-500';
  }

  if (status.status === 'waiting') {
    return 'bg-amber-400';
  }

  return 'bg-emerald-500';
}

function getStatusLabel(status: AgentActivityStatus['status']) {
  switch (status) {
    case 'thinking':
      return 'Thinking';
    case 'tool-calling':
      return 'Tool calling';
    case 'waiting':
      return 'Waiting';
    case 'done':
      return 'Done';
    case 'error':
      return 'Error';
    case 'idle':
    default:
      return 'Idle';
  }
}

function getStatusBadgeClass(status: AgentActivityStatus['status']) {
  switch (status) {
    case 'thinking':
      return 'border-sky-500/30 bg-sky-500/10 text-sky-700';
    case 'tool-calling':
      return 'border-violet-500/30 bg-violet-500/10 text-violet-700';
    case 'waiting':
      return 'border-amber-500/30 bg-amber-500/10 text-amber-700';
    case 'done':
      return 'border-red-500/30 bg-red-500/10 text-red-700';
    case 'error':
      return 'border-red-500/30 bg-red-500/10 text-red-700';
    case 'idle':
    default:
      return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700';
  }
}

function getActivitySummary(status: AgentActivityStatus) {
  if (status.currentTool) {
    return status.toolArgsSummary
      ? `${status.currentTool} · ${status.toolArgsSummary}`
      : status.currentTool;
  }

  if (status.status === 'error') {
    return 'Run ended with an error';
  }

  if (status.status === 'done') {
    return 'Session finished';
  }

  if (status.toolArgsSummary) {
    const durationSuffix = status.lastToolDurationMs === null
      ? ''
      : ` · ${status.lastToolDurationMs}ms`;

    return `Last: ${status.toolArgsSummary}${durationSuffix}`;
  }

  if (status.lastToolResult) {
    return `Last result: ${status.lastToolResult}`;
  }

  return 'Idle';
}

function getWorkItemTitle(
  status: AgentActivityStatus,
  titlesById: Map<string, string>,
) {
  if (status.workItemTitle) {
    return status.workItemTitle;
  }

  if (!status.workItemId) {
    return null;
  }

  return titlesById.get(status.workItemId) ?? null;
}

export function AgentActivityPanel() {
  const items = useAppStore((state) => state.items);
  const [statuses, setStatuses] = useState<AgentActivityStatus[]>([]);
  const [isOpen, setIsOpen] = useState(() => readPanelOpenPreference());
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let isDisposed = false;
    let didReceiveLiveUpdate = false;

    const load = async () => {
      const initialStatuses = await window.duneDesktop?.getAgentActivity?.();

      if (isDisposed || didReceiveLiveUpdate || !initialStatuses) {
        return;
      }

      setStatuses(initialStatuses);
      setNow(Date.now());
    };

    void load();

    const unsubscribe = window.duneDesktop?.subscribeAgentActivity?.((nextStatuses) => {
      didReceiveLiveUpdate = true;
      setStatuses(nextStatuses);
      setNow(Date.now());
    });

    return () => {
      isDisposed = true;
      unsubscribe?.();
    };
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(PANEL_OPEN_STORAGE_KEY, String(isOpen));
    } catch {
      // Ignore storage failures in non-browser test environments.
    }
  }, [isOpen]);

  useEffect(() => {
    const nextRefreshInMs = statuses
      .map((status) => {
        const updatedAtMs = Date.parse(status.updatedAt);

        if (!Number.isFinite(updatedAtMs)) {
          return null;
        }

        const ageMs = Math.max(0, now - updatedAtMs);

        if (ageMs < STALE_WARNING_MS) {
          return STALE_WARNING_MS - ageMs;
        }

        if (ageMs < STALE_ERROR_MS) {
          return STALE_ERROR_MS - ageMs;
        }

        return null;
      })
      .filter((value): value is number => value !== null)
      .sort((left, right) => left - right)[0];

    if (nextRefreshInMs === undefined) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setNow(Date.now());
    }, Math.max(50, nextRefreshInMs + 50));

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [now, statuses]);

  const itemTitlesById = new Map(items.map((item) => [item.id, item.title] as const));

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
              {statuses.length}
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
          {statuses.length === 0 ? (
            <div className="rounded-[18px] border border-dashed border-app-border bg-app-card/40 px-4 py-4 text-sm text-app-muted">
              No live agent activity yet.
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {statuses.map((status) => {
                const workItemTitle = getWorkItemTitle(status, itemTitlesById);

                return (
                  <article
                    className="rounded-[18px] border border-app-border bg-app-card/70 px-4 py-3"
                    key={status.agentId}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-start gap-3">
                        <span
                          aria-hidden="true"
                          className={cn(
                            'mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full',
                            getStatusDotClass(status, now),
                          )}
                        />
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium text-app-text">
                            {status.agentName}
                          </div>
                          <div className="mt-1 text-xs leading-5 text-app-muted">
                            {getActivitySummary(status)}
                          </div>
                          {workItemTitle ? (
                            <div className="mt-1 text-xs leading-5 text-app-muted">
                              Work item · <span className="text-app-text">{workItemTitle}</span>
                            </div>
                          ) : null}
                          {status.lastToolResult ? (
                            <div className="mt-1 text-xs leading-5 text-app-muted">
                              Result · <span className="text-app-text">{status.lastToolResult}</span>
                            </div>
                          ) : null}
                          <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-app-muted">
                            <span
                              className={cn(
                                'rounded-full border px-2 py-0.5 font-medium',
                                getStatusBadgeClass(status.status),
                              )}
                            >
                              {getStatusLabel(status.status)}
                            </span>
                            <span className="uppercase tracking-[0.12em]">
                              turn {status.turnCount}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="shrink-0 text-[11px] text-app-muted">
                        {formatLastUpdated(status.updatedAt, now)}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}
