import { describe, expect, it } from 'vitest';

import type { WorkflowItem } from './snapshot';
import { assertAgentCanMoveItem } from './validators';

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

  it('rejects agent moves into human-only lanes', () => {
    expect(() =>
      assertAgentCanMoveItem('agent-1', createItem('review'), 'acceptance'),
    ).toThrow('Only humans can move work items into acceptance or done.');

    expect(() =>
      assertAgentCanMoveItem('agent-1', createItem('review'), 'done'),
    ).toThrow('Only humans can move work items into acceptance or done.');
  });

  it('rejects agent moves out of acceptance', () => {
    expect(() =>
      assertAgentCanMoveItem('agent-1', createItem('acceptance'), 'active'),
    ).toThrow('Agents cannot move work items out of acceptance or done.');
  });
});
