// Priority and SLA helpers for workflow items.

import type {
  ItemPriority,
  WorkflowItemStatus,
} from '@/renderer/features/workflow/types';

export const DEFAULT_ITEM_PRIORITY: ItemPriority = 'medium';

export const PRIORITY_ORDER: Record<ItemPriority, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

export const SLA_WARNING_WINDOW_MS = 2 * 60 * 60 * 1000;

export function isItemPriority(value: unknown): value is ItemPriority {
  return value === 'critical' || value === 'high' || value === 'medium' || value === 'low';
}

export function normalizeItemPriority(value: unknown): ItemPriority {
  return isItemPriority(value) ? value : DEFAULT_ITEM_PRIORITY;
}

export function normalizeSlaDeadlineMs(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : undefined;
}

export function compareWorkflowPriority(
  left: { priority?: ItemPriority; updatedAt: number },
  right: { priority?: ItemPriority; updatedAt: number },
) {
  const priorityDelta =
    PRIORITY_ORDER[normalizeItemPriority(left.priority)]
    - PRIORITY_ORDER[normalizeItemPriority(right.priority)];

  return priorityDelta === 0 ? right.updatedAt - left.updatedAt : priorityDelta;
}

export function isSlaTerminalStatus(status: WorkflowItemStatus | string) {
  return status === 'acceptance' || status === 'done';
}

export function getSlaState(
  slaDeadlineMs: number | undefined,
  status: WorkflowItemStatus | string,
  now: number = Date.now(),
) {
  if (!slaDeadlineMs) {
    return null;
  }

  const msLeft = slaDeadlineMs - now;

  if (isSlaTerminalStatus(status)) {
    return {
      isBreached: false,
      isMet: true,
      isWarning: false,
      msLeft,
    };
  }

  return {
    isBreached: msLeft <= 0,
    isMet: false,
    isWarning: msLeft > 0 && msLeft <= SLA_WARNING_WINDOW_MS,
    msLeft,
  };
}
