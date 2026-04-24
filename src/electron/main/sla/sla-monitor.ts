// Workflow SLA deadline monitor.

import type { AppStorage } from '@/electron/main/storage';
import {
  createWorkflowEvent,
  recordWorkflowItemEvents,
} from '@/electron/main/agent-actions/handlers/snapshot';
import type {
  WorkflowItem,
  WorkflowSnapshot,
} from '@/electron/main/agent-actions/handlers/snapshot';
import type {
  NotificationManager,
  NotificationTriggerType,
} from '@/electron/main/notifications/notification-manager';
import { isPlainObject } from '@/shared/is-record';

const DEFAULT_INTERVAL_MS = 5 * 60 * 1000;
const WARNING_WINDOW_MS = 2 * 60 * 60 * 1000;

interface SlaMonitorOptions {
  clearInterval?: typeof globalThis.clearInterval;
  intervalMs?: number;
  notificationManager?: Pick<NotificationManager, 'notify'>;
  now?: () => number;
  onWorkflowChanged: () => void;
  setInterval?: typeof globalThis.setInterval;
  workflowStore: AppStorage;
}

/** Monitors active work items for upcoming and breached SLA deadlines. */
export class SlaMonitor {
  private intervalHandle: ReturnType<typeof globalThis.setInterval> | null = null;

  private readonly clearIntervalFn: typeof globalThis.clearInterval;

  private readonly intervalMs: number;

  private readonly notificationManager: Pick<NotificationManager, 'notify'> | undefined;

  private readonly now: () => number;

  private readonly onWorkflowChanged: () => void;

  private readonly setIntervalFn: typeof globalThis.setInterval;

  private readonly workflowStore: AppStorage;

  constructor(options: SlaMonitorOptions) {
    this.clearIntervalFn = options.clearInterval ?? globalThis.clearInterval;
    this.intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
    this.notificationManager = options.notificationManager;
    this.now = options.now ?? Date.now;
    this.onWorkflowChanged = options.onWorkflowChanged;
    this.setIntervalFn = options.setInterval ?? globalThis.setInterval;
    this.workflowStore = options.workflowStore;
  }

  start(): void {
    if (this.intervalHandle) {
      return;
    }

    this.intervalHandle = this.setIntervalFn(() => {
      void this.runOnce();
    }, this.intervalMs);
    void this.runOnce();
  }

  stop(): void {
    if (!this.intervalHandle) {
      return;
    }

    this.clearIntervalFn(this.intervalHandle);
    this.intervalHandle = null;
  }

  async runOnce(): Promise<void> {
    const snapshot = await this.workflowStore.get<WorkflowSnapshot>('snapshot');

    if (!isWorkflowSnapshotLike(snapshot)) {
      return;
    }

    const now = this.now();
    let dirty = false;

    for (const item of snapshot.items) {
      const trigger = this.getTrigger(item, now);

      if (!trigger) {
        continue;
      }

      if (trigger === 'sla_warning') {
        item.slaWarnedAt = now;
        recordWorkflowItemEvents(
          snapshot,
          item,
          [createWorkflowEvent('item.sla_warning', `SLA warning: "${item.title}" is due soon.`, now, 'Dune')],
          now,
        );
        this.notifyWarning(item, now);
      } else {
        item.slaBreachedAt = now;
        recordWorkflowItemEvents(
          snapshot,
          item,
          [createWorkflowEvent('item.sla_breached', `SLA breached: "${item.title}" missed its deadline.`, now, 'Dune')],
          now,
        );
        this.notifyBreach(item);
      }

      dirty = true;
    }

    if (!dirty) {
      return;
    }

    await this.workflowStore.set('snapshot', snapshot);
    this.onWorkflowChanged();
  }

  private getTrigger(item: WorkflowItem, now: number): NotificationTriggerType | null {
    if (
      (item.status !== 'active' && item.status !== 'review') ||
      typeof item.slaDeadlineMs !== 'number'
    ) {
      return null;
    }

    const msLeft = item.slaDeadlineMs - now;

    if (msLeft <= 0 && typeof item.slaBreachedAt !== 'number') {
      return 'sla_breach';
    }

    if (msLeft > 0 && msLeft <= WARNING_WINDOW_MS && typeof item.slaWarnedAt !== 'number') {
      return 'sla_warning';
    }

    return null;
  }

  private notifyWarning(item: WorkflowItem, now: number): void {
    this.notify('sla_warning', item, `SLA expiring soon: ${item.title} — ${formatRemaining(item.slaDeadlineMs! - now)} remaining`);
  }

  private notifyBreach(item: WorkflowItem): void {
    this.notify('sla_breach', item, `SLA breached: ${item.title} — deadline has passed`);
  }

  private notify(trigger: NotificationTriggerType, item: WorkflowItem, body: string): void {
    this.notificationManager?.notify({
      body,
      itemId: item.id,
      title: trigger === 'sla_warning' ? 'SLA expiring soon' : 'SLA breached',
      trigger,
    });
  }
}

function isWorkflowSnapshotLike(value: unknown): value is WorkflowSnapshot {
  return isPlainObject(value) && Array.isArray(value.items) && Array.isArray(value.projects);
}

function formatRemaining(ms: number): string {
  const totalMinutes = Math.max(0, Math.ceil(ms / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  return `${hours}h ${minutes}m`;
}
