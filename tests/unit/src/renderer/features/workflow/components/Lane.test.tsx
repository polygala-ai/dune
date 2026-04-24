import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { WorkflowBoard } from '@/renderer/features/workflow/components/WorkflowBoard';
import type { ItemPriority, WorkflowItemSummary } from '@/renderer/features/workflow/types';

function item(id: string, title: string, priority: ItemPriority, updatedAt: number): WorkflowItemSummary {
  return {
    brief: '',
    completedTaskCount: 0,
    currentTaskTitle: null,
    hasBlockedTasks: false,
    id,
    isAgentWorking: false,
    priority,
    primaryAgentId: null,
    primaryAgentName: null,
    specialStateLabel: null,
    status: 'active',
    statusLabel: 'Active',
    title,
    totalTaskCount: 0,
    updatedAt,
    updatedLabel: 'now',
  };
}

describe('workflow lane sorting', () => {
  it('sorts by priority and then updatedAt descending', () => {
    render(
      <WorkflowBoard
        items={[
          item('low', 'Low', 'low', 100),
          item('high-old', 'High old', 'high', 100),
          item('critical', 'Critical', 'critical', 50),
          item('high-new', 'High new', 'high', 200),
        ]}
        onMoveItem={vi.fn()}
        onSelectItem={vi.fn()}
        selectedItemId={null}
      />,
    );

    const titles = within(screen.getByTestId('workflow-column-body-active'))
      .getAllByRole('button', { name: /Open/ })
      .map((button) => button.getAttribute('aria-label'));

    expect(titles).toEqual(['Open Critical', 'Open High new', 'Open High old', 'Open Low']);
  });
});
