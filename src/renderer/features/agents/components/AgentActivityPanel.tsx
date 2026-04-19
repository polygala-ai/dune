// Sidebar panel for live agent activity.

import { useEffect, useState } from 'react';
import {
  Activity,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';

import type {
  AgentActivityEntry,
  AgentActivitySnapshot,
  AgentActivityStatus,
  AgentActivityUpdatePayload,
} from '@/shared/agents/agent-activity';
import { cn } from '@/renderer/shared/lib/utils';
import { ScrollArea } from '@/renderer/shared/ui/scroll-area';

const STORAGE_KEY = 'dune.agent-activity-panel.open';
const ONE_SECOND_IN_MS = 1_000;
const ONE_MINUTE_IN_MS = 60_000;
const ONE_HOUR_IN_MS = 60 * ONE_MINUTE_IN_MS;
const ONE_DAY_IN_MS = 24 * ONE_HOUR_IN_MS;

function readStoredOpenState(): boolean {
  if (typeof window === 'undefined') {
    return true;
  }

  try {
    const storedValue = window.localStorage.getItem(STORAGE_KEY);

    if (storedValue === null) {
      return true;
    }

    return storedValue === 'true';
  } catch {
    return true;
  }
}

function compareActivities(left: AgentActivityEntry, right: AgentActivityEntry): number {
  const weight = (activity: AgentActivityEntry) => {
    switch (activity.status?.status) {
      case 'working':
        return 0;
      case 'error':
        return 1;
      case 'idle':
        return 2;
      case 'done':
        return 3;
      default:
        return activity.isAlive ? 4 : 1;
    }
  };

  const weightDifference = weight(left) - weight(right);

  if (weightDifference !== 0) {
    return weightDifference;
  }

  const leftUpdatedAt = left.status ? Date.parse(left.status.updatedAt) : 0;
  const rightUpdatedAt = right.status ? Date.parse(right.status.updatedAt) : 0;
  const updatedAtDifference = rightUpdatedAt - leftUpdatedAt;

  if (updatedAtDifference !== 0) {
    return updatedAtDifference;
  }

  return left.agentName.localeCompare(right.agentName);
}

function getStatusDotClassName(activity: AgentActivityEntry): string {
  if (!activity.isAlive || activity.status?.status === 'error') {
    return 'bg-red-500';
  }

  if (activity.status?.status === 'working') {
    return 'bg-emerald-400';
  }

  return 'bg-slate-400';
}

function getPrimaryLabel(status: AgentActivityStatus | null, isAlive: boolean): string {
  if (!status) {
    return isAlive ? 'Waiting for status update' : 'No active session';
  }

  if (status.status === 'working') {
    return status.currentTool
      ?? status.toolArgsSummary
      ?? 'Working';
  }

  if (status.toolArgsSummary) {
    return status.toolArgsSummary;
  }

  if (status.currentTool) {
    return `Last tool: ${status.currentTool}`;
  }

  switch (status.status) {
    case 'error':
      return 'Agent reported an error';
    case 'done':
      return 'Session finished';
    case 'idle':
    default:
      return 'Idle';
  }
}

function formatRelativeAge(updatedAt: string, now: number): string {
  const timestamp = Date.parse(updatedAt);

  if (!Number.isFinite(timestamp)) {
    return 'No status yet';
  }

  const ageInMs = Math.max(0, now - timestamp);

  if (ageInMs < ONE_SECOND_IN_MS) {
    return 'just now';
  }

  if (ageInMs < ONE_MINUTE_IN_MS) {
    return `${Math.floor(ageInMs / ONE_SECOND_IN_MS)}s ago`;
  }

  if (ageInMs < ONE_HOUR_IN_MS) {
    return `${Math.floor(ageInMs / ONE_MINUTE_IN_MS)}m ago`;
  }

  if (ageInMs < ONE_DAY_IN_MS) {
    return `${Math.floor(ageInMs / ONE_HOUR_IN_MS)}h ago`;
  }

  return `${Math.floor(ageInMs / ONE_DAY_IN_MS)}d ago`;
}

function getMetaLabel(activity: AgentActivityEntry, now: number): string {
  const segments = [
    activity.status ? formatRelativeAge(activity.status.updatedAt, now) : 'No status yet',
  ];

  if (activity.status?.lastToolDurationMs !== null && activity.status?.lastToolDurationMs !== undefined) {
    segments.push(`${activity.status.lastToolDurationMs} ms`);
  }

  if ((activity.status?.turnCount ?? 0) > 0) {
    segments.push(`${activity.status?.turnCount} turns`);
  }

  return segments.join(' · ');
}

function activityEntriesFromSnapshot(snapshot: AgentActivitySnapshot): Record<string, AgentActivityEntry> {
  return Object.fromEntries(snapshot.agents.map((activity) => [activity.agentId, activity]));
}

/** Renders the real-time agent activity sidebar panel. */
export function AgentActivityPanel() {
  const [isOpen, setIsOpen] = useState(readStoredOpenState);
  const [activities, setActivities] = useState<Record<string, AgentActivityEntry>>({});

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, String(isOpen));
    } catch {
      // Ignore storage failures in restricted environments.
    }
  }, [isOpen]);

  useEffect(() => {
    let isDisposed = false;

    const loadActivities = async () => {
      const snapshot = await window.duneDesktop?.getAgentActivity?.();

      if (isDisposed || !snapshot) {
        return;
      }

      setActivities(activityEntriesFromSnapshot(snapshot));
    };

    void loadActivities().catch((error) => {
      console.error('Failed to load initial agent activity snapshot.', error);
    });

    const unsubscribe = window.duneDesktop?.subscribeAgentActivity?.(
      (payload: AgentActivityUpdatePayload) => {
        setActivities((currentActivities) => ({
          ...currentActivities,
          [payload.agentId]: payload,
        }));
      },
    );

    return () => {
      isDisposed = true;
      unsubscribe?.();
    };
  }, []);

  const orderedActivities = Object.values(activities).sort(compareActivities);
  const now = Date.now();

  return (
    <section className="shrink-0 px-1 pt-4" data-testid="agent-activity-panel">
      <button
        aria-expanded={isOpen}
        className="flex w-full items-center justify-between rounded-[14px] px-3 py-2 text-left transition-colors hover:bg-app-card"
        onClick={() => setIsOpen((open) => !open)}
        type="button"
      >
        <span className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-app-muted">
          <Activity className="h-3.5 w-3.5" />
          Activity
        </span>
        <span className="flex items-center gap-2 text-[11px] text-app-muted">
          <span>{orderedActivities.length}</span>
          {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </span>
      </button>

      {isOpen ? (
        orderedActivities.length > 0 ? (
          <ScrollArea className="mt-2 max-h-64 pr-1" contentWidth="fill">
            <div className="space-y-2 pr-2">
              {orderedActivities.map((activity) => (
                <article
                  className="rounded-[16px] border border-app-border bg-app-card/60 px-3 py-3"
                  key={activity.agentId}
                >
                  <div className="flex items-start gap-3">
                    <span
                      className={cn(
                        'mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full',
                        getStatusDotClassName(activity),
                      )}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-medium text-app-text">
                        {activity.agentName}
                      </div>
                      <div className="mt-1 text-[12px] leading-5 text-app-muted">
                        {getPrimaryLabel(activity.status, activity.isAlive)}
                      </div>
                      {activity.status?.workItemTitle || activity.status?.workItemId ? (
                        <div className="mt-1 truncate text-[11px] leading-5 text-app-muted">
                          {activity.status?.workItemTitle ?? `Work item ${activity.status?.workItemId}`}
                        </div>
                      ) : null}
                      <div className="mt-2 text-[10px] uppercase tracking-[0.12em] text-app-muted">
                        {getMetaLabel(activity, now)}
                      </div>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </ScrollArea>
        ) : (
          <div className="mt-2 rounded-[16px] border border-dashed border-app-border px-3 py-4 text-[12px] leading-5 text-app-muted">
            No live agent sessions yet.
          </div>
        )
      ) : null}
    </section>
  );
}
