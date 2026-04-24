import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ItemCard } from '@/renderer/features/workflow/components/WorkflowBoard';
import type { WorkflowItemSummary } from '@/renderer/features/workflow/types';

function item(overrides: Partial<WorkflowItemSummary> = {}): WorkflowItemSummary {
  return {
    brief: 'Brief',
    completedTaskCount: 0,
    currentTaskTitle: null,
    hasBlockedTasks: false,
    id: 'item-1',
    isAgentWorking: false,
    priority: 'critical',
    primaryAgentId: null,
    primaryAgentName: null,
    specialStateLabel: null,
    status: 'active',
    statusLabel: 'Active',
    title: 'Important item',
    totalTaskCount: 1,
    updatedAt: 1,
    updatedLabel: 'just now',
    ...overrides,
  };
}

describe('ItemCard SLA and priority badges', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders priority badge colors', () => {
    render(<ItemCard active={false} item={item()} onSelect={vi.fn()} />);

    expect(screen.getByTestId('priority-badge-critical')).toHaveClass('text-[#ef4444]');
  });

  it('only renders medium and low priority badges when SLA is set', () => {
    const { rerender } = render(
      <ItemCard active={false} item={item({ priority: 'medium' })} onSelect={vi.fn()} />,
    );

    expect(screen.queryByTestId('priority-badge-medium')).toBeNull();

    rerender(
      <ItemCard
        active={false}
        item={item({ priority: 'low', slaDeadlineMs: Date.now() + 3 * 60 * 60 * 1000 })}
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getByTestId('priority-badge-low')).toHaveClass('text-[#6b7280]');
  });

  it('renders warning, breached, and met countdown variants', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);

    const { rerender } = render(
      <ItemCard
        active={false}
        item={item({ slaDeadlineMs: 60 * 60 * 1000 + 1_000 })}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByTestId('sla-countdown')).toHaveClass('text-yellow-600');

    rerender(
      <ItemCard active={false} item={item({ slaDeadlineMs: 500 })} onSelect={vi.fn()} />,
    );
    expect(screen.getByTestId('sla-countdown')).toHaveClass('text-red-500');

    rerender(
      <ItemCard active={false} item={item({ slaDeadlineMs: 500, status: 'done' })} onSelect={vi.fn()} />,
    );
    expect(screen.getByTestId('sla-countdown')).toHaveClass('text-emerald-500');
  });
});
