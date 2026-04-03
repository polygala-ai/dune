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

export const workflowItemStatusLabels: Record<WorkflowItemStatus, string> = {
  active: 'Active',
  done: 'Done',
  inbox: 'Inbox',
  ready: 'Ready',
  review: 'Review',
};

export const workflowTaskStatusLabels: Record<WorkflowTaskStatus, string> = {
  blocked: 'Blocked',
  doing: 'Doing',
  done: 'Done',
  review: 'Review',
  todo: 'To do',
};

function compareItems(left: WorkflowItem, right: WorkflowItem) {
  if (left.sortOrder !== right.sortOrder) {
    return left.sortOrder - right.sortOrder;
  }

  return right.updatedAt - left.updatedAt;
}

export function formatWorkflowItemStatus(status: WorkflowItemStatus) {
  return workflowItemStatusLabels[status];
}

export function formatWorkflowTaskStatus(status: WorkflowTaskStatus) {
  return workflowTaskStatusLabels[status];
}

export function selectWorkflowProjectById(
  projects: WorkflowProject[],
  selectedProjectId: string | null,
) {
  if (!selectedProjectId) {
    return null;
  }

  return projects.find((project) => project.id === selectedProjectId) ?? null;
}

export function selectWorkflowItemById(
  items: WorkflowItem[],
  selectedItemId: string | null,
) {
  if (!selectedItemId) {
    return null;
  }

  return items.find((item) => item.id === selectedItemId) ?? null;
}

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

export function getProjectAgents(
  agents: Agent[],
  projectId: string | null,
) {
  if (!projectId) {
    return [];
  }

  return agents.filter((agent) => agent.projectId === projectId);
}

export function getWorkflowSnapshotState(snapshot: WorkflowSnapshot): WorkflowSnapshot {
  return {
    items: snapshot.items.map((item) => ({
      ...item,
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

export function presentWorkflowItemSummary(
  item: WorkflowItem,
  agentsById: Map<string, Agent>,
  now: number = Date.now(),
): WorkflowItemSummary {
  const totalTaskCount = item.tasks.length;
  const completedTaskCount = item.tasks.filter((task) => task.status === 'done').length;
  const hasBlockedTasks = item.tasks.some((task) => task.status === 'blocked');
  const primaryAgent = item.primaryAgentId
    ? agentsById.get(item.primaryAgentId) ?? null
    : null;
  const specialStateLabel = hasBlockedTasks
    ? 'Blocked'
    : item.status === 'review'
      ? 'Review'
      : null;

  return {
    brief: item.brief,
    completedTaskCount,
    hasBlockedTasks,
    id: item.id,
    primaryAgentId: item.primaryAgentId,
    primaryAgentName: primaryAgent?.name ?? null,
    specialStateLabel,
    status: item.status,
    statusLabel: formatWorkflowItemStatus(item.status),
    title: item.title,
    totalTaskCount,
    updatedLabel: formatAgentTimestamp(item.updatedAt, now),
  };
}

export function presentWorkflowEventTimestamp(timestamp: number, now: number = Date.now()) {
  return formatMessageTimestamp(timestamp, now);
}
