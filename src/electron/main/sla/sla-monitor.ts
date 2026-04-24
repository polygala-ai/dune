// SLA warning and breach monitor for persisted workflow snapshots.

import type { AppStorage } from '@/electron/main/storage';
import { createId } from '@/shared/id';
import { isPlainObject } from '@/shared/is-record';
import {
  SLA_WARNING_WINDOW_MS,
  getSlaState,
  isSlaTerminalStatus,
} from '@/shared/workflow/priority-sla';

interface SlaMonitorOptions {
  clearInterval?: typeof globalThis.clearInterval;
  notifySla?: (notification: SlaNotification) => void;
  notifyWorkflowChanged: () => void;
  now?: () => number;
  setInterval?: typeof globalThis.setInterval;
  workflowStore: AppStorage;
}

export interface SlaNotification {
  itemId: string;
  itemTitle: string;
  msLeft?: number;
  type: 'sla_warning' | 'sla_breach';
}

interface SlaWorkflowSnapshot {
  items: Array<Record<string, unknown>>;
  projects: Array<Record<string, unknown>>;
}

function isSlaWorkflowSnapshot(value: unknown): value is SlaWorkflowSnapshot {
  return isPlainObject(value) && Array.isArray(value.items) && Array.isArray(value.projects);
}

function prependSlaEvent(
  item: Record<string, unknown>,
  description: string,
  now: number,
) {
  const workflowEvents = Array.isArray(item.workflowEvents) ? item.workflowEvents : [];

  item.workflowEvents = [
    {
      actor: 'Dune',
      createdAt: now,
      description,
      id: createId('event'),
      kind: 'item',
    },
    ...workflowEvents,
  ];
  item.updatedAt = now;
}

/** Creates the periodic SLA monitor. */
export function createSlaMonitor(options: SlaMonitorOptions) {
  const clearIntervalFn = options.clearInterval ?? globalThis.clearInterval;
  const setIntervalFn = options.setInterval ?? globalThis.setInterval;
  const nowFn = options.now ?? Date.now;
  let intervalHandle: ReturnType<typeof globalThis.setInterval> | null = null;

  async function checkNow() {
    const snapshot = await options.workflowStore.get('snapshot');

    if (!isSlaWorkflowSnapshot(snapshot)) {
      return;
    }

    const now = nowFn();
    let dirty = false;

    for (const item of snapshot.items) {
      const id = typeof item.id === 'string' ? item.id : null;
      const title = typeof item.title === 'string' ? item.title : 'Untitled work item';
      const status = typeof item.status === 'string' ? item.status : 'inbox';
      const slaDeadlineMs = typeof item.slaDeadlineMs === 'number' ? item.slaDeadlineMs : undefined;

      if (!id || !slaDeadlineMs || isSlaTerminalStatus(status)) {
        continue;
      }

      const sla = getSlaState(slaDeadlineMs, status, now);

      if (!sla) {
        continue;
      }

      if (sla.isBreached && typeof item.slaBreachedAt !== 'number') {
        item.slaBreachedAt = now;
        prependSlaEvent(item, 'SLA breached.', now);
        options.notifySla?.({ itemId: id, itemTitle: title, type: 'sla_breach' });
        dirty = true;
        continue;
      }

      if (
        sla.msLeft > 0 &&
        sla.msLeft <= SLA_WARNING_WINDOW_MS &&
        typeof item.slaWarnedAt !== 'number'
      ) {
        item.slaWarnedAt = now;
        prependSlaEvent(item, `SLA warning: ${Math.ceil(sla.msLeft / 60_000)} minutes remaining.`, now);
        options.notifySla?.({
          itemId: id,
          itemTitle: title,
          msLeft: sla.msLeft,
          type: 'sla_warning',
        });
        dirty = true;
      }
    }

    if (dirty) {
      await options.workflowStore.set('snapshot', snapshot);
      options.notifyWorkflowChanged();
    }
  }

  function start() {
    if (intervalHandle) {
      return;
    }

    intervalHandle = setIntervalFn(() => {
      void checkNow();
    }, 5 * 60_000);
  }

  function stop() {
    if (!intervalHandle) {
      return;
    }

    clearIntervalFn(intervalHandle);
    intervalHandle = null;
  }

  return {
    checkNow,
    start,
    stop,
  };
}
