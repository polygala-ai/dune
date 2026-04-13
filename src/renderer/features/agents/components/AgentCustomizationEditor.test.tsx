import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { AgentCustomizationEditor } from '@/renderer/features/agents/components/AgentCustomizationEditor';
import { createEmptyAgentCustomizationDraft } from '@/renderer/features/agents/model/agent-customization';

describe('AgentCustomizationEditor', () => {
  it('opens the worker instructions file for custom agents', async () => {
    const user = userEvent.setup();

    render(
      <AgentCustomizationEditor
        agentRole="custom"
        artifactsPath="/tmp/dune-artifacts"
        onChange={vi.fn()}
        value={createEmptyAgentCustomizationDraft()}
      />,
    );

    await user.click(screen.getByRole('button', { name: /Open original file/i }));

    expect(window.duneDesktop?.openPath).toHaveBeenCalledWith(
      '/tmp/dune-artifacts/dune-agent-instructions.md',
    );
  });

  it('opens the project-main instructions file for project-main agents', async () => {
    const user = userEvent.setup();

    render(
      <AgentCustomizationEditor
        agentRole="project-main"
        artifactsPath="/tmp/dune-artifacts"
        onChange={vi.fn()}
        value={createEmptyAgentCustomizationDraft()}
      />,
    );

    await user.click(screen.getByRole('button', { name: /Open original file/i }));

    expect(window.duneDesktop?.openPath).toHaveBeenCalledWith(
      '/tmp/dune-artifacts/project-main-instructions.md',
    );
  });
});
