// Workflow project actions menu UI.

import {
  MoreHorizontal,
  PanelRight,
} from 'lucide-react';

import { useAppCommands } from '@/renderer/app/store/app-commands';
import { useWorkflowSession } from '@/renderer/app/store/selectors';
import { Button } from '@/renderer/shared/ui/button';

/** Workflow project actions menu props. */
interface WorkflowProjectActionsMenuProps {
  className?: string;
  dataTestId?: string;
  presentation?: 'popover' | 'drawer';
}

/** Renders the workflow project actions menu UI. */
export function WorkflowProjectActionsMenu({
  className,
  dataTestId = 'project-actions-button',
  presentation = 'popover',
}: WorkflowProjectActionsMenuProps) {
  const commands = useAppCommands();
  const { selectedProject } = useWorkflowSession();

  if (!selectedProject) {
    return null;
  }

  const triggerIcon = presentation === 'drawer'
    ? <PanelRight className="h-4 w-4" />
    : <MoreHorizontal className="h-4 w-4" />;

  return (
    <Button
      aria-label="Project actions"
      className={className}
      data-testid={dataTestId}
      onClick={() => {
        commands.openProjectSettings();
      }}
      size="icon"
      type="button"
      variant="quiet"
    >
      {triggerIcon}
    </Button>
  );
}
