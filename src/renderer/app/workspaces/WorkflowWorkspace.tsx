import {
  MoreHorizontal,
  Plus,
} from 'lucide-react';
import { useState } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { CompactShellToolbar } from '@/renderer/app/shell/CompactShellToolbar';
import { useAppCommands } from '@/renderer/app/store/app-commands';
import {
  useShellState,
  useWorkflowSession,
} from '@/renderer/app/store/selectors';
import { useAppStore } from '@/renderer/app/store/use-app-store';
import { CreateProjectDialog } from '@/renderer/features/workflow/components/CreateProjectDialog';
import { CreateWorkItemDialog } from '@/renderer/features/workflow/components/CreateWorkItemDialog';
import { WorkflowBoard } from '@/renderer/features/workflow/components/WorkflowBoard';
import { WorkflowItemInspector } from '@/renderer/features/workflow/components/WorkflowItemInspector';
import { WorkflowProjectActivity } from '@/renderer/features/workflow/components/WorkflowProjectActivity';
import { WorkflowProjectAgents } from '@/renderer/features/workflow/components/WorkflowProjectAgents';
import { WorkflowProjectSettings } from '@/renderer/features/workflow/components/WorkflowProjectSettings';
import { agentRuntime } from '@/renderer/features/agents/runtime/agent-runtime';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/renderer/shared/ui/dialog';
import { Button } from '@/renderer/shared/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/renderer/shared/ui/popover';

const projectHeaderTabs = [
  { label: 'Activity', value: 'activity' },
  { label: 'Board', value: 'board' },
  { label: 'Agents', value: 'agents' },
] as const;

interface WorkflowWorkspaceProps {
  isCompactShell: boolean;
  isCreateProjectOpen: boolean;
  isCreateWorkItemOpen: boolean;
  isSidebarOpen: boolean;
  onCreateProjectOpenChange: (open: boolean) => void;
  onCreateWorkItemOpenChange: (open: boolean) => void;
  onOpenCreateAgent: () => void;
  onToggleSidebar: () => void;
}

export function WorkflowWorkspace({
  isCompactShell,
  isCreateProjectOpen,
  isCreateWorkItemOpen,
  isSidebarOpen,
  onCreateProjectOpenChange,
  onCreateWorkItemOpenChange,
  onOpenCreateAgent,
  onToggleSidebar,
}: WorkflowWorkspaceProps) {
  const commands = useAppCommands();
  const { route } = useShellState();
  const [isProjectMenuOpen, setProjectMenuOpen] = useState(false);
  const [isDeleteProjectOpen, setDeleteProjectOpen] = useState(false);
  const {
    addTask,
    addWorkProduct,
    assignPrimaryAgent,
    closeProjectSettings,
    createItem,
    createProject,
    deleteProject,
    moveItem,
    openProjectSettings,
    selectItem,
    selectProjectView,
    updateProject,
    updateItem,
    updateTask,
  } = useAppStore(
    useShallow((state) => ({
      addTask: state.addTask,
      addWorkProduct: state.addWorkProduct,
      assignPrimaryAgent: state.assignPrimaryAgent,
      closeProjectSettings: state.closeProjectSettings,
      createItem: state.createItem,
      createProject: state.createProject,
      deleteProject: state.deleteProject,
      moveItem: state.moveItem,
      openProjectSettings: state.openProjectSettings,
      selectItem: state.selectItem,
      selectProjectView: state.selectProjectView,
      updateProject: state.updateProject,
      updateItem: state.updateItem,
      updateTask: state.updateTask,
    })),
  );
  const {
    activityEntries,
    filteredItemSummaries,
    isWorkflowHydrated,
    projectAgents,
    projects,
    selectedItem,
    selectedProject,
    selectedProjectId,
    selectedProjectScreen,
    selectedProjectView,
  } = useWorkflowSession();
  const isBoardView = selectedProjectView === 'board';
  const isAgentsView = selectedProjectView === 'agents';
  const isSettingsScreen = selectedProjectScreen === 'settings';

  if (!isWorkflowHydrated) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center">
        <div className="text-center">
          <div className="surface-eyebrow">Project</div>
          <h2 className="surface-title">Loading project page</h2>
          <p className="surface-description">
            Restoring the local project, board, and work item state.
          </p>
        </div>
      </div>
    );
  }

  const handleCreateAgentForItem = async (itemId: string) => {
    const item = selectedItem?.id === itemId
      ? selectedItem
      : null;

    if (!item || !selectedProjectId) {
      return;
    }

    const suggestedName = `${item.title} agent`;

    const agentId = await commands.createAgentWithOptions(
      {
        channelId: 'dune-chat',
        name: suggestedName,
        projectId: selectedProjectId,
      },
      { openRoute: false },
    );

    assignPrimaryAgent(itemId, {
      agentId,
      agentName: suggestedName,
    });
  };

  const handleDeleteProject = async () => {
    if (!selectedProject) {
      return;
    }

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

  const boardView = (
    <>
      {isCompactShell ? (
        <div className="flex h-full min-h-0 flex-col">
          <WorkflowBoard
            items={filteredItemSummaries}
            onMoveItem={moveItem}
            onSelectItem={(itemId) => {
              selectItem(itemId);
            }}
            selectedItemId={selectedItem?.id ?? null}
          />
        </div>
      ) : (
        <div className="grid h-full min-h-0 gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="min-h-0 overflow-hidden rounded-[28px] border border-app-border bg-app-panel/70 px-4 py-4">
            <WorkflowBoard
              items={filteredItemSummaries}
              onMoveItem={moveItem}
              onSelectItem={(itemId) => {
                selectItem(itemId);
              }}
              selectedItemId={selectedItem?.id ?? null}
            />
          </div>

          <div className="min-h-0">
            <WorkflowItemInspector
              item={selectedItem}
              onAddTask={(itemId, title) => {
                addTask(itemId, title);
              }}
              onAddWorkProduct={(itemId, input) => {
                addWorkProduct(itemId, input);
              }}
              onAssignPrimaryAgent={assignPrimaryAgent}
              onCreateAgent={handleCreateAgentForItem}
              onOpenAgent={(agentId) => commands.openAgent(agentId)}
              onUpdateItem={updateItem}
              onUpdateItemStatus={(itemId, status) =>
                moveItem(itemId, status, Number.MAX_SAFE_INTEGER)
              }
              onUpdateTask={updateTask}
              project={selectedProject}
              projectAgents={projectAgents.map((agent) => ({
                id: agent.id,
                name: agent.name,
              }))}
            />
          </div>
        </div>
      )}
    </>
  );

  const compactInspector = (
    <WorkflowItemInspector
      item={selectedItem}
      onAddTask={(itemId, title) => {
        addTask(itemId, title);
      }}
      onAddWorkProduct={(itemId, input) => {
        addWorkProduct(itemId, input);
      }}
      onAssignPrimaryAgent={assignPrimaryAgent}
      onCreateAgent={handleCreateAgentForItem}
      onOpenAgent={(agentId) => commands.openAgent(agentId)}
      onUpdateItem={updateItem}
      onUpdateItemStatus={(itemId, status) =>
        moveItem(itemId, status, Number.MAX_SAFE_INTEGER)
      }
      onUpdateTask={updateTask}
      project={selectedProject}
      projectAgents={projectAgents.map((agent) => ({
        id: agent.id,
        name: agent.name,
      }))}
    />
  );

  const projectActionMenu = selectedProject ? (
    <Popover onOpenChange={setProjectMenuOpen} open={isProjectMenuOpen}>
      <PopoverTrigger asChild>
        <Button
          aria-label="Project actions"
          data-testid="project-actions-button"
          size="icon"
          type="button"
          variant="quiet"
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        className="w-[220px] p-2"
        sideOffset={10}
      >
        <div className="space-y-1">
          <button
            className="flex w-full items-center rounded-[14px] px-3 py-2.5 text-left text-sm font-medium text-app-text transition-colors hover:bg-app-card"
            data-testid="configure-project-button"
            onClick={() => {
              setProjectMenuOpen(false);
              openProjectSettings();
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
      </PopoverContent>
    </Popover>
  ) : null;

  const emptyState = (
    <div className="flex min-h-0 flex-1 items-center justify-center px-6 pb-6 pt-5">
      <section className="w-full max-w-[540px] rounded-[28px] border border-dashed border-app-border bg-app-panel/70 px-8 py-12 text-center">
        <div className="surface-eyebrow">Projects</div>
        <h2 className="mt-3 text-[1.7rem] font-semibold tracking-[-0.05em] text-app-text">
          No projects yet
        </h2>
        <p className="mt-3 text-sm leading-6 text-app-muted">
          Create a project to organize work items and keep agents scoped to that project.
        </p>
        <div className="mt-6">
          <Button onClick={() => onCreateProjectOpenChange(true)} type="button">
            New project
          </Button>
        </div>
      </section>
    </div>
  );

  return (
    <>
      {isCompactShell ? (
        <CompactShellToolbar
          isSidebarOpen={isSidebarOpen}
          onToggleSidebar={onToggleSidebar}
        />
      ) : null}

      {projects.length === 0 || !selectedProject
        ? emptyState
        : (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-6 pb-6 pt-5">
            {isSettingsScreen ? (
              <div
                className="mt-5 min-h-0 flex-1 overflow-y-auto pr-1"
                data-testid="workflow-project-page-scroll"
              >
                <WorkflowProjectSettings
                  onCancel={closeProjectSettings}
                  onDelete={() => setDeleteProjectOpen(true)}
                  onSave={(input) => {
                    updateProject(selectedProject.id, input);
                    closeProjectSettings();
                  }}
                  project={selectedProject}
                />
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-4 border-b border-app-border pb-5">
                  <div className="min-w-0">
                    <div className="surface-eyebrow">Project</div>
                    <h2 className="surface-title">
                      {selectedProject.name}
                    </h2>

                    <div
                      aria-label="Project sections"
                      className="mt-4 flex flex-wrap gap-2"
                      role="tablist"
                    >
                      {projectHeaderTabs.map((tab) => {
                        const isActive = selectedProjectView === tab.value;

                        return (
                          <button
                            aria-selected={isActive}
                            className={isActive ? 'pill-key bg-app-accent-soft text-app-text' : 'pill-key'}
                            key={tab.value}
                            onClick={() => selectProjectView(tab.value)}
                            role="tab"
                            type="button"
                          >
                            {tab.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {isBoardView ? (
                      <Button
                        onClick={() => onCreateWorkItemOpenChange(true)}
                        type="button"
                      >
                        <Plus className="h-4 w-4" />
                        New work item
                      </Button>
                    ) : null}
                    {isAgentsView ? (
                      <Button
                        onClick={onOpenCreateAgent}
                        type="button"
                      >
                        <Plus className="h-4 w-4" />
                        New agent
                      </Button>
                    ) : null}
                    {projectActionMenu}
                  </div>
                </div>

                <div
                  className={
                    selectedProjectView === 'board'
                      ? 'mt-5 min-h-0 flex-1 overflow-hidden'
                      : 'mt-5 min-h-0 flex-1 overflow-y-auto pr-1'
                  }
                  data-testid={
                    selectedProjectView === 'board'
                      ? 'workflow-project-board-slot'
                      : 'workflow-project-page-scroll'
                  }
                >
                  {selectedProjectView === 'board' ? (
                    boardView
                  ) : selectedProjectView === 'agents' ? (
                    <WorkflowProjectAgents
                      agents={projectAgents}
                      onOpenAgent={commands.openAgent}
                      onOpenItem={(itemId) => {
                        selectItem(itemId);
                        selectProjectView('board');
                      }}
                    />
                  ) : (
                    <WorkflowProjectActivity
                      entries={activityEntries}
                      onOpenItem={(itemId) => {
                        selectItem(itemId);
                        selectProjectView('board');
                      }}
                    />
                  )}
                </div>
              </>
            )}
          </div>
        )}

      <Dialog
        onOpenChange={(open) => {
          if (!open) {
            selectItem(null);
          }
        }}
        open={
          isCompactShell &&
          selectedProjectScreen === 'main' &&
          selectedProjectView === 'board' &&
          !!selectedItem
        }
      >
        <DialogContent className="flex h-[calc(100vh-var(--app-drag-strip-height)-2rem)] max-h-[820px] w-[min(94vw,540px)] flex-col overflow-hidden p-0">
          <DialogTitle className="sr-only">Work item inspector</DialogTitle>
          <DialogDescription className="sr-only">
            Review and edit the selected work item.
          </DialogDescription>
          {compactInspector}
        </DialogContent>
      </Dialog>

      <Dialog onOpenChange={setDeleteProjectOpen} open={isDeleteProjectOpen}>
        <DialogContent className="w-[min(92vw,520px)]">
          <DialogTitle>
            Delete {selectedProject?.name ?? 'project'}?
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

      <CreateProjectDialog
        onCreateProject={(input) => {
          createProject(input);
          onCreateProjectOpenChange(false);
        }}
        onOpenChange={onCreateProjectOpenChange}
        open={isCreateProjectOpen}
      />

      <CreateWorkItemDialog
        initialProjectId={selectedProjectId}
        onCreateItem={(input) => {
          createItem(input);
          onCreateWorkItemOpenChange(false);
        }}
        onOpenChange={onCreateWorkItemOpenChange}
        open={isCreateWorkItemOpen}
        projects={projects}
      />
    </>
  );
}
