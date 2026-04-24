// Tool analytics workspace tests.

import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ToolAnalyticsWorkspace } from '@/renderer/app/workspaces/ToolAnalyticsWorkspace';

describe('ToolAnalyticsWorkspace', () => {
  it('loads and renders AgentLite tool usage rows', async () => {
    window.duneDesktop = {
      platform: 'darwin',
      getToolUsageSummary: vi.fn(() => Promise.resolve({
        generatedAt: '2026-04-25T00:00:00.000Z',
        rows: [
          {
            avgDurationMs: 42,
            callCount: 10,
            successCount: 7,
            successRate: 0.7,
            toolName: 'Bash',
          },
        ],
        windowHours: 1,
      })),
    };

    render(
      <ToolAnalyticsWorkspace
        isCompactShell={false}
        isSidebarOpen={false}
        onToggleSidebar={vi.fn()}
        showCompactSidebarToggle={false}
      />,
    );

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: 'Tool Analytics' }),
      ).toBeInTheDocument();
      expect(screen.getByRole('cell', { name: 'Bash' })).toBeInTheDocument();
      expect(screen.getByRole('cell', { name: '30%' })).toBeInTheDocument();
    });

    expect(window.duneDesktop.getToolUsageSummary).toHaveBeenCalledTimes(1);
  });
});
