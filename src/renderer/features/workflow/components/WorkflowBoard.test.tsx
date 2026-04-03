import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { WorkflowBoard } from '@/renderer/features/workflow/components/WorkflowBoard';
import type { WorkflowItemSummary } from '@/renderer/features/workflow/types';

const baseItem = (
  id: string,
  title: string,
  status: WorkflowItemSummary['status'],
): WorkflowItemSummary => ({
  brief: `Brief for ${title}`,
  completedTaskCount: 0,
  hasBlockedTasks: false,
  id,
  primaryAgentId: null,
  primaryAgentName: null,
  specialStateLabel: status === 'review' ? 'Review' : null,
  status,
  statusLabel: status,
  title,
  totalTaskCount: 1,
  updatedLabel: 'just now',
});

describe('WorkflowBoard', () => {
  it('keeps tall columns independently scrollable without clipping lower cards', () => {
    render(
      <WorkflowBoard
        items={[
          baseItem('ready-1', 'Ready item', 'ready'),
          baseItem('review-1', 'First review item', 'review'),
          baseItem('review-2', 'Second review item', 'review'),
          baseItem('review-3', 'Third review item', 'review'),
        ]}
        onMoveItem={vi.fn()}
        onSelectItem={vi.fn()}
        selectedItemId={null}
      />,
    );

    const reviewColumnBody = screen.getByTestId('workflow-column-body-review');

    expect(reviewColumnBody).toHaveClass('min-h-0', 'overflow-y-auto', 'no-scrollbar');
    expect(within(reviewColumnBody).getByText('First review item')).toBeInTheDocument();
    expect(within(reviewColumnBody).getByText('Second review item')).toBeInTheDocument();
    expect(within(reviewColumnBody).getByText('Third review item')).toBeInTheDocument();

    const activeColumnBody = screen.getByTestId('workflow-column-body-active');

    expect(activeColumnBody).toHaveClass('overflow-y-auto');
    expect(
      within(activeColumnBody).getByText(
        'Drop a work item here or create a new one for this stage.',
      ),
    ).toBeInTheDocument();
  });
});
