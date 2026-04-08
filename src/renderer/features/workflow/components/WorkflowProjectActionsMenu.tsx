import {
  MoreHorizontal,
  PanelRight,
  X,
} from 'lucide-react';
import { useState } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { useAppCommands } from '@/renderer/app/store/app-commands';
import {
  useShellState,
  useWorkflowSession,
} from '@/renderer/app/store/selectors';
import { useAppStore } from '@/renderer/app/store/use-app-store';
import { agentRuntime } from '@/renderer/features/agents/runtime/agent-runtime';
import { Button } from '@/renderer/shared/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTrigger,
  DialogTitle,
} from '@/renderer/shared/ui/dialog';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/renderer/shared/ui/popover';
import { Separator } from '@/renderer/shared/ui/separator';

interface WorkflowProjectActionsMenuProps {
  className?: string;
  dataTestId?: string;
  presentation?: 'popover' | 'drawer';
}

export function WorkflowProjectActionsMenu({
  className,
  dataTestId = 'project-actions-button',
  presentation = 'popover',
}: WorkflowProjectActionsMenuProps) {
  const commands = useAppCommands();
  const { route } = useShellState();
  const [isDeleteProjectOpen, setDeleteProjectOpen] = useState(false);
  const [isProjectMenuOpen, setProjectMenuOpen] = useState(false);
  const {
    projectAgents,
    selectedProject,
  } = useWorkflowSession();
  const {
    deleteProject,
  } = useAppStore(
    useShallow((state) => ({
      deleteProject: state.deleteProject,
    })),
  );

  if (!selectedProject) {
    return null;
  }

  const triggerIcon = presentation === 'drawer'
    ? <PanelRight className="h-4 w-4" />
    : <MoreHorizontal className="h-4 w-4" />;

  const actionList = (
    <div className="space-y-1">
      <button
        className="flex w-full items-center rounded-[14px] px-3 py-2.5 text-left text-sm font-medium text-app-text transition-colors hover:bg-app-card"
        data-testid="configure-project-button"
        onClick={() => {
          setProjectMenuOpen(false);
          commands.openProjectSettings();
        }}
        type="button"
      >
        Configure project
      </button>
      <button
        className="flex w-full items-center rounded-[14px] px-3 py-2.5 text-left text-sm font-medium text-red-700 transition-colors hover:bg-red-50"
        data-testid="delete-project-menu-button"
        onClick={() => {
          setProjectMenuOpen(false);
          setDeleteProjectOpen(true);
        }}
        type="button"
      >
        Delete project
      </button>
    </div>
  );

  const handleDeleteProject = async () => {
    const projectAgentIds = projectAgents.map((agent) => agent.id);
    const selectedAgentId = useAppStore.getState().selectedAgentId;

    if (
      route === 'agent' &&
      selectedAgentId &&
      projectAgentIds.includes(selectedAgentId)
    ) {
      commands.openWorkflow();
    }

    await Promise.all(projectAgentIds.map((agentId) => agentRuntime.service.deleteAgent(agentId)));
    deleteProject(selectedProject.id);
    setDeleteProjectOpen(false);
    setProjectMenuOpen(false);
  };

  return (
    <>
      {presentation === 'drawer' ? (
        <Dialog onOpenChange={setProjectMenuOpen} open={isProjectMenuOpen}>
          <DialogTrigger asChild>
            <Button
              aria-label="Project actions"
              className={className}
              data-testid={dataTestId}
              size="icon"
              type="button"
              variant="quiet"
            >
              {triggerIcon}
            </Button>
          </DialogTrigger>

          <DialogContent
            className="shell-context-drawer"
            data-dialog-motion="drawer"
            overlayProps={{
              'data-testid': 'project-actions-overlay',
              onClick: () => setProjectMenuOpen(false),
            }}
          >
            <DialogTitle className="sr-only">Project actions</DialogTitle>
            <DialogDescription className="sr-only">
              Inspect and manage the current project.
            </DialogDescription>
            <DialogClose asChild>
              <Button
                aria-label="Close project actions"
                className="absolute right-4 top-4 z-10"
                size="icon"
                type="button"
                variant="quiet"
              >
                <X className="h-4 w-4" />
              </Button>
            </DialogClose>

            <aside
              className="app-no-drag panel-reveal flex min-h-0 h-full flex-col overflow-hidden px-3 pb-4 pt-4"
              data-testid="project-actions-panel"
            >
              <div className="px-2 pb-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.26em] text-app-muted">
                    <PanelRight className="h-3 w-3" />
                    Project
                  </div>
                  <h3 className="mt-5 truncate text-[13px] font-medium text-app-text">
                    {selectedProject.name}
                  </h3>
                  <p className="mt-1 text-[12px] leading-5 text-app-muted">
                    Inspect and manage this project.
                  </p>
                </div>
              </div>

              <Separator />

              <div className="mt-6 flex min-h-0 flex-1 flex-col px-1">
                <div className="px-3">
                  {actionList}
                </div>
              </div>
            </aside>
          </DialogContent>
        </Dialog>
      ) : (
        <Popover onOpenChange={setProjectMenuOpen} open={isProjectMenuOpen}>
          <PopoverTrigger asChild>
            <Button
              aria-label="Project actions"
              className={className}
              data-testid={dataTestId}
              size="icon"
              type="button"
              variant="quiet"
            >
              {triggerIcon}
            </Button>
          </PopoverTrigger>

          <PopoverContent
            align="end"
            className="w-[220px] p-2"
            sideOffset={10}
          >
            {actionList}
          </PopoverContent>
        </Popover>
      )}

      <Dialog onOpenChange={setDeleteProjectOpen} open={isDeleteProjectOpen}>
        <DialogContent className="w-[min(92vw,520px)]">
          <DialogTitle>
            Delete {selectedProject.name}?
          </DialogTitle>
          <DialogDescription className="mt-2 leading-6">
            This will permanently delete the project, its work items, and its
            project-owned agents.
          </DialogDescription>

          <div className="mt-6 flex items-center justify-end gap-2">
            <Button
              onClick={() => setDeleteProjectOpen(false)}
              type="button"
              variant="ghost"
            >
              Cancel
            </Button>
            <Button
              className="bg-red-700 text-white hover:bg-red-800"
              data-testid="confirm-delete-project-button"
              onClick={() => {
                void handleDeleteProject();
              }}
              type="button"
            >
              Delete project
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
