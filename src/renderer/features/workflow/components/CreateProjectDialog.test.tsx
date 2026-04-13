import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { CreateProjectDialog } from '@/renderer/features/workflow/components/CreateProjectDialog';

describe('CreateProjectDialog', () => {
  it('requires a name and project folder before creating the project', async () => {
    const user = userEvent.setup();
    const onCreateProject = vi.fn();
    const onSelectProjectDirectory = vi.fn(async () => '/tmp/studio-ops');

    render(
      <CreateProjectDialog
        onCreateProject={onCreateProject}
        onOpenChange={vi.fn()}
        onSelectProjectDirectory={onSelectProjectDirectory}
        open
      />,
    );

    expect(screen.queryByText('Accent')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Create project$/i })).toBeDisabled();

    await user.type(screen.getByLabelText('Project name'), 'Studio Ops');
    await user.click(screen.getByRole('button', { name: /choose folder/i }));
    await user.click(screen.getByRole('button', { name: /^Create project$/i }));

    expect(onCreateProject).toHaveBeenCalledWith({
      description: '',
      name: 'Studio Ops',
      rootPath: '/tmp/studio-ops',
    });
  });

  it('accepts an optional description without changing the required fields', async () => {
    const user = userEvent.setup();
    const onCreateProject = vi.fn();
    const onSelectProjectDirectory = vi.fn(async () => '/tmp/research-ops');

    render(
      <CreateProjectDialog
        onCreateProject={onCreateProject}
        onOpenChange={vi.fn()}
        onSelectProjectDirectory={onSelectProjectDirectory}
        open
      />,
    );

    await user.type(screen.getByLabelText('Project name'), 'Research Ops');
    await user.click(screen.getByRole('button', { name: /choose folder/i }));
    await user.type(screen.getByLabelText('Description'), 'Clarify the next project phase.');
    await user.click(screen.getByRole('button', { name: /^Create project$/i }));

    expect(onCreateProject).toHaveBeenCalledWith({
      description: 'Clarify the next project phase.',
      name: 'Research Ops',
      rootPath: '/tmp/research-ops',
    });
  });
});
