import { ToolHandlerError } from './types';
import {
  createWorkflowEvent,
  touchProject,
  type WorkflowItem,
  type WorkflowItemStatus,
  type WorkflowSnapshot,
} from './snapshot';

export function assertAgentCanCreateItem(status: string) {
  if (status !== 'inbox' && status !== 'ready') {
    throw new ToolHandlerError(
      'validation-error',
      'Agents can only create work items in inbox or ready.',
    );
  }
}

export function assertAgentCanEditItem(item: WorkflowItem) {
  if (item.status !== 'inbox') {
    throw new ToolHandlerError(
      'validation-error',
      'Only inbox work items can be edited by agents.',
    );
  }
}

export function assertAgentCanMoveItem(
  agentId: string,
  item: WorkflowItem,
  nextStatus: WorkflowItemStatus,
) {
  // Only humans can move items to done (final approval gate).
  if (nextStatus === 'done') {
    throw new ToolHandlerError(
      'validation-error',
      'Only humans can move work items into done.',
    );
  }

  // Agents can move review → active (rejection with feedback) but not review → other.
  if (item.status === 'review' && nextStatus !== 'active') {
    throw new ToolHandlerError(
      'validation-error',
      'Review items can only be moved back to active (rejection) by agents.',
    );
  }

  if (item.status === 'done') {
    throw new ToolHandlerError(
      'validation-error',
      'Agents cannot move work items out of done.',
    );
  }

  if (item.status === 'inbox' && nextStatus !== 'ready') {
    throw new ToolHandlerError(
      'validation-error',
      'Inbox items can only be moved to ready by agents.',
    );
  }

  if (item.status === 'ready') {
    if (nextStatus !== 'active') {
      throw new ToolHandlerError(
        'validation-error',
        'Ready work items can only move to active.',
      );
    }

    assertAssignedWorker(agentId, item, 'claim ready work items');
    return;
  }

  if (item.status === 'active') {
    if (nextStatus !== 'review') {
      throw new ToolHandlerError(
        'validation-error',
        'Active work items can only move to review.',
      );
    }

    assertAssignedWorker(agentId, item, 'move active work items to review');
    return;
  }
}

export function assertAgentCanMutateTasks(agentId: string, item: WorkflowItem) {
  if (item.status === 'inbox') {
    return;
  }

  if (item.status === 'active') {
    assertAssignedWorker(agentId, item, 'update tasks on active work items');
    return;
  }

  throw new ToolHandlerError(
    'validation-error',
    'Agents can only change tasks while a work item is in inbox or active.',
  );
}

export function assertAgentCanAddWorkProduct(agentId: string, item: WorkflowItem) {
  if (item.status !== 'active') {
    throw new ToolHandlerError(
      'validation-error',
      'Agents can only add work products while a work item is active.',
    );
  }

  assertAssignedWorker(agentId, item, 'add work products to active work items');
}

export function assertAgentCanSetPrimaryAgent(item: WorkflowItem) {
  if (item.status !== 'ready') {
    throw new ToolHandlerError(
      'validation-error',
      'Primary agent assignment can only change while a work item is in ready.',
    );
  }
}

export function assertAssignedWorker(agentId: string, item: WorkflowItem, action: string) {
  if (item.primaryAgentId !== agentId) {
    throw new ToolHandlerError(
      'validation-error',
      `Only the assigned worker can ${action}.`,
    );
  }
}

export function clearPrimaryAgentAssignments(
  snapshot: WorkflowSnapshot,
  agentId: string,
  timestamp: number,
): boolean {
  let cleared = false;

  for (const item of snapshot.items) {
    if (item.primaryAgentId === agentId) {
      item.primaryAgentId = null;
      item.updatedAt = timestamp;
      item.workflowEvents.unshift(
        createWorkflowEvent('assignment', 'Primary agent cleared.', timestamp),
      );
      touchProject(snapshot, item.projectId, timestamp);
      cleared = true;
    }
  }

  return cleared;
}
