import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { CreateProjectDialog } from '@/renderer/features/workflow/components/CreateProjectDialog';

describe('CreateProjectDialog', () => {
  it('keeps creation lightweight and submits with only a name', async () => {
    const user = userEvent.setup();
    const onCreateProject = vi.fn();

    render(
      <CreateProjectDialog
        onCreateProject={onCreateProject}
        onOpenChange={vi.fn()}
        open
      />,
    );

    expect(screen.queryByText('Accent')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Create project$/i })).toBeDisabled();

    await user.type(screen.getByLabelText('Project name'), 'Studio Ops');
    await user.click(screen.getByRole('button', { name: /^Create project$/i }));

    expect(onCreateProject).toHaveBeenCalledWith({
      description: '',
      name: 'Studio Ops',
    });
  });

  it('accepts an optional description without changing the required fields', async () => {
    const user = userEvent.setup();
    const onCreateProject = vi.fn();

    render(
      <CreateProjectDialog
        onCreateProject={onCreateProject}
        onOpenChange={vi.fn()}
        open
      />,
    );

    await user.type(screen.getByLabelText('Project name'), 'Research Ops');
    await user.type(screen.getByLabelText('Description'), 'Clarify the next project phase.');
    await user.click(screen.getByRole('button', { name: /^Create project$/i }));

    expect(onCreateProject).toHaveBeenCalledWith({
      description: 'Clarify the next project phase.',
      name: 'Research Ops',
    });
  });
});
