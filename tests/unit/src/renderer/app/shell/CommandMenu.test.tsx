// Command menu tests.

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { CommandMenu } from '@/renderer/app/shell/CommandMenu';

describe('CommandMenu', () => {
  it('renders agent status labels in the agent list', () => {
    render(
      <CommandMenu
        agents={[
          {
            id: 'agent-1',
            name: 'Navigator',
            preview: 'Reviewing the latest thread.',
            projectId: 'project-1',
            statusLabel: 'Streaming',
            updatedLabel: 'Now',
            workspace: 'AgentLite agent',
          },
        ]}
        isContextPanelOpen={false}
        items={[]}
        onCreateAgent={vi.fn()}
        onCreateItem={vi.fn()}
        onCreateProject={vi.fn()}
        onOpenBoard={vi.fn()}
        onOpenChange={vi.fn()}
        onOpenSettings={vi.fn()}
        onOpenToolAnalytics={vi.fn()}
        onSelectAgent={vi.fn()}
        onSelectItem={vi.fn()}
        onSelectProject={vi.fn()}
        onToggleContextPanel={vi.fn()}
        open
        projects={[]}
      />,
    );

    expect(screen.getByText('Streaming · AgentLite agent')).toBeInTheDocument();
  });
});
