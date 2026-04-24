// Workflow presenter helpers.

import {
  formatAgentTimestamp,
  formatMessageTimestamp,
} from '@/renderer/features/agents/model/time';
import type { Agent } from '@/renderer/features/agents/types';
import type {
  WorkflowItem,
  WorkflowItemStatus,
  WorkflowItemSummary,
  WorkflowProject,
  WorkflowSnapshot,
  WorkflowTaskStatus,
} from '@/renderer/features/workflow/types';
import { compareWorkflowPriority } from '@/shared/workflow/priority-sla';

/** Defines workflow item status labels. */
export const workflowItemStatusLabels: Record<WorkflowItemStatus, string> = {
  acceptance: 'Acceptance',
  active: 'Active',
  done: 'Done',
  inbox: 'Inbox',
  ready: 'Ready',
  review: 'Review',
};

/** Defines workflow task status labels. */
export const workflowTaskStatusLabels: Record<WorkflowTaskStatus, string> = {
  blocked: 'Blocked',
  doing: 'Doing',
  done: 'Done',
  review: 'Review',
  todo: 'To do',
};

/** Compares items. */
function compareItems(left: WorkflowItem, right: WorkflowItem) {
  const priorityDelta = compareWorkflowPriority(left, right);

  if (priorityDelta !== 0) {
    return priorityDelta;
  }

  if (left.sortOrder !== right.sortOrder) {
    return left.sortOrder - right.sortOrder;
  }

  return right.updatedAt - left.updatedAt;
}

/** Formats workflow item status. */
export function formatWorkflowItemStatus(status: WorkflowItemStatus) {
  return workflowItemStatusLabels[status];
}

/** Formats workflow task status. */
export function formatWorkflowTaskStatus(status: WorkflowTaskStatus) {
  return workflowTaskStatusLabels[status];
}

/** Selects workflow project by ID. */
export function selectWorkflowProjectById(
  projects: WorkflowProject[],
  selectedProjectId: string | null,
) {
  if (!selectedProjectId) {
    return null;
  }

  return projects.find((project) => project.id === selectedProjectId) ?? null;
}

/** Selects workflow item by ID. */
export function selectWorkflowItemById(
  items: WorkflowItem[],
  selectedItemId: string | null,
) {
  if (!selectedItemId) {
    return null;
  }

  return items.find((item) => item.id === selectedItemId) ?? null;
}

/** Returns project items. */
export function getProjectItems(
  items: WorkflowItem[],
  projectId: string | null,
) {
  if (!projectId) {
    return [];
  }

  return items
    .filter((item) => item.projectId === projectId)
    .sort(compareItems);
}

/** Returns project agents. */
export function getProjectAgents(
  agents: Agent[],
  projectId: string | null,
) {
  if (!projectId) {
    return [];
  }

  return agents.filter((agent) => agent.projectId === projectId);
}

/** Returns workflow snapshot state. */
export function getWorkflowSnapshotState(snapshot: WorkflowSnapshot): WorkflowSnapshot {
  return {
    items: snapshot.items.map((item) => ({
      ...item,
      activity: { ...item.activity },
      tasks: item.tasks.map((task) => ({ ...task })),
      workProducts: item.workProducts.map((product) => ({ ...product })),
      workflowEvents: item.workflowEvents.map((event) => ({ ...event })),
    })),
    projects: snapshot.projects.map((project) => ({ ...project })),
    selectedItemId: snapshot.selectedItemId,
    selectedProjectFilter: snapshot.selectedProjectFilter,
    selectedProjectId: snapshot.selectedProjectId,
    selectedProjectView: snapshot.selectedProjectView,
  };
}

/** Presents workflow item summary. */
export function presentWorkflowItemSummary(
  item: WorkflowItem,
  agentsById: Map<string, Agent>,
  itemActivity: Record<string, { isWorking: boolean }> = {},
  now: number = Date.now(),
): WorkflowItemSummary {
  const totalTaskCount = item.tasks.length;
  const completedTaskCount = item.tasks.filter((task) => task.status === 'done').length;
  const hasBlockedTasks = item.tasks.some((task) => task.status === 'blocked');
  const primaryAgent = item.primaryAgentId
    ? agentsById.get(item.primaryAgentId) ?? null
    : null;
  const isAgentWorking = itemActivity[item.id]?.isWorking === true;
  const currentTask = isAgentWorking
    ? item.tasks.find((task) => task.status === 'doing') ?? null
    : null;
  const specialStateLabel = hasBlockedTasks
    ? 'Blocked'
    : item.status === 'review'
      ? 'Review'
      : item.status === 'acceptance'
        ? 'Acceptance'
      : null;

  return {
    brief: item.brief,
    completedTaskCount,
    currentTaskTitle: currentTask?.title ?? null,
    hasBlockedTasks,
    id: item.id,
    isAgentWorking,
    primaryAgentId: item.primaryAgentId,
    primaryAgentName: primaryAgent?.name ?? null,
    priority: item.priority,
    ...(item.slaDeadlineMs ? { slaDeadlineMs: item.slaDeadlineMs } : {}),
    specialStateLabel,
    status: item.status,
    statusLabel: formatWorkflowItemStatus(item.status),
    title: item.title,
    totalTaskCount,
    updatedAt: item.updatedAt,
    updatedLabel: formatAgentTimestamp(item.updatedAt, now),
  };
}

/** Presents workflow event timestamp. */
export function presentWorkflowEventTimestamp(timestamp: number, now: number = Date.now()) {
  return formatMessageTimestamp(timestamp, now);
}
