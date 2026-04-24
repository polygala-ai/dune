import { describe, expect, it } from 'vitest';

import type { WorkflowItem } from '@/electron/main/agent-actions/handlers/snapshot';
import { assertAgentCanMoveItem } from '@/electron/main/agent-actions/handlers/validators';

function createItem(status: WorkflowItem['status']): WorkflowItem {
  return {
    activity: {
      archivedEventCount: 0,
      hasOlderEvents: false,
      rollingSummary: null,
      totalEventCount: 0,
    },
    artifactFolderName: 'item-1',
    brief: 'Brief',
    createdAt: 1,
    id: 'item-1',
        priority: 'medium',
    primaryAgentId: 'agent-1',
    projectId: 'project-1',
    scheduledTaskId: null,
    sortOrder: 0,
    status,
    tasks: [],
    title: 'Item',
    updatedAt: 1,
    workProducts: [],
    workflowEvents: [],
  };
}

describe('assertAgentCanMoveItem', () => {
  it('allows review items to move back to active for rejection', () => {
    expect(() => assertAgentCanMoveItem('agent-1', createItem('review'), 'active')).not.toThrow();
  });

  it('allows review items to move to acceptance after approval', () => {
    expect(() =>
      assertAgentCanMoveItem('agent-1', createItem('review'), 'acceptance'),
    ).not.toThrow();
  });

  it('rejects unsupported agent moves from review', () => {
    expect(() =>
      assertAgentCanMoveItem('agent-1', createItem('review'), 'ready'),
    ).toThrow(
      'Review items can only be moved to acceptance (approval) or back to active (rejection) by agents.',
    );
  });

  it('rejects agent moves into done', () => {
    expect(() =>
      assertAgentCanMoveItem('agent-1', createItem('review'), 'done'),
    ).toThrow('Only humans can move work items into done.');
  });

  it('allows acceptance items to move back into the workflow', () => {
    expect(() =>
      assertAgentCanMoveItem('agent-1', createItem('acceptance'), 'active'),
    ).not.toThrow();
  });

  it('rejects agent moves out of done', () => {
    expect(() =>
      assertAgentCanMoveItem('agent-1', createItem('done'), 'active'),
    ).toThrow('Agents cannot move work items out of done.');
  });
});
