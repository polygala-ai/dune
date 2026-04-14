// Workflow workspace UI.

import {
  Plus,
  X,
} from 'lucide-react';
import { useState } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { CompactShellToolbar } from '@/renderer/app/shell/CompactShellToolbar';
import { useAppCommands } from '@/renderer/app/store/app-commands';
import { useWorkflowSession } from '@/renderer/app/store/selectors';
import { useAppStore } from '@/renderer/app/store/use-app-store';
import { CreateProjectDialog } from '@/renderer/features/workflow/components/CreateProjectDialog';
import { CreateWorkItemDialog } from '@/renderer/features/workflow/components/CreateWorkItemDialog';
import { WorkflowBoard } from '@/renderer/features/workflow/components/WorkflowBoard';
import { WorkflowItemInspector } from '@/renderer/features/workflow/components/WorkflowItemInspector';
import { WorkflowProjectActivity } from '@/renderer/features/workflow/components/WorkflowProjectActivity';
import { WorkflowProjectActionsMenu } from '@/renderer/features/workflow/components/WorkflowProjectActionsMenu';
import { WorkflowProjectAgents } from '@/renderer/features/workflow/components/WorkflowProjectAgents';
import { WorkflowProjectSettings } from '@/renderer/features/workflow/components/WorkflowProjectSettings';
import { agentRuntime } from '@/renderer/features/agents/runtime/agent-runtime';
import { createAgentAssignmentMessage } from '@/shared/agents/assignment-message';
import { resolveMountedItemArtifactPath } from '@/shared/workflow/project-artifacts';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/renderer/shared/ui/dialog';
import { Button } from '@/renderer/shared/ui/button';
import type { AgentRuntimeInfo } from '@/renderer/features/agents/types';

const projectHeaderTabs = [
  { label: 'Activity', value: 'activity' },
  { label: 'Board', value: 'board' },
  { label: 'Agents', value: 'agents' },
] as const;

/** Workflow workspace props. */
interface WorkflowWorkspaceProps {
  isCompactShell: boolean;
  isCreateProjectOpen: boolean;
  isCreateWorkItemOpen: boolean;
  isSidebarOpen: boolean;
  onCreateProjectOpenChange: (open: boolean) => void;
  onCreateWorkItemOpenChange: (open: boolean) => void;
  onOpenCreateAgent: () => void;
  onToggleSidebar: () => void;
  runtimeInfo: AgentRuntimeInfo;
  showCompactSidebarToggle: boolean;
  showTitlebarProjectCreateAction: boolean;
  showTitlebarProjectActions: boolean;
}

/** Renders the workflow workspace UI. */
export function WorkflowWorkspace({
  isCompactShell,
  isCreateProjectOpen,
  isCreateWorkItemOpen,
  isSidebarOpen,
  onCreateProjectOpenChange,
  onCreateWorkItemOpenChange,
  onOpenCreateAgent,
  onToggleSidebar,
  runtimeInfo,
  showCompactSidebarToggle,
  showTitlebarProjectCreateAction,
  showTitlebarProjectActions,
}: WorkflowWorkspaceProps) {
  const commands = useAppCommands();
  const [isDeleteProjectOpen, setDeleteProjectOpen] = useState(false);
  const {
    addTask,
    assignPrimaryAgent,
    clearAgentAssignments,
    closeProjectSettings,
    createItem,
    createProject,
    deleteProject,
    moveItem,
    selectItem,
    updateProject,
    updateItem,
    updateTask,
  } = useAppStore(
    useShallow((state) => ({
      addTask: state.addTask,
      assignPrimaryAgent: state.assignPrimaryAgent,
      clearAgentAssignments: state.clearAgentAssignments,
      closeProjectSettings: state.closeProjectSettings,
      createItem: state.createItem,
      createProject: state.createProject,
      deleteProject: state.deleteProject,
      moveItem: state.moveItem,
      selectItem: state.selectItem,
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
  const isProjectAgentsInitializing =
    isAgentsView &&
    runtimeInfo.status === 'starting' &&
    projectAgents.length === 0;
  const isSettingsScreen = selectedProjectScreen === 'settings';

  if (!isWorkflowHydrated) {
    return (
      <div
        aria-busy="true"
        className="flex min-h-0 flex-1 items-center justify-center"
      >
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

  /** Handles primary agent assignment. */
  const handleAssignPrimaryAgent = async (
    itemId: string,
    input: { agentId: string | null; agentName?: string | null },
  ) => {
    const state = useAppStore.getState();
    const item = state.items.find((candidate) => candidate.id === itemId) ?? null;
    const previousAgentId = item?.primaryAgentId ?? null;

    assignPrimaryAgent(itemId, input);

    if (!item || !input.agentId || previousAgentId === input.agentId) {
      return;
    }

    const projectName = state.projects.find((project) => project.id === item.projectId)?.name ?? null;
    const projectRootPath = state.projects.find((project) => project.id === item.projectId)?.rootPath ?? null;
    const assignmentMessage = createAgentAssignmentMessage({
      agentName: input.agentName ?? null,
      artifactPath: resolveMountedItemArtifactPath(projectRootPath, item.artifactFolderName),
      itemBrief: item.brief,
      itemStatus: item.status,
      itemTitle: item.title,
      projectName,
      tasks: item.tasks.map((task) => ({
        status: task.status,
        title: task.title,
      })),
    });

    try {
      await agentRuntime.service.sendMessage(input.agentId, assignmentMessage);
    } catch (error) {
      console.error(`Failed to create an assignment task for agent "${input.agentId}".`, error);
    }
  };

  /** Handles agent for item creation. */
  const handleCreateAgentForItem = async (itemId: string) => {
    const state = useAppStore.getState();
    const item = state.items.find((candidate) => candidate.id === itemId) ?? null;

    if (!item || !selectedProjectId) {
      return;
    }

    const suggestedName = `${item.title} agent`;

    const agentId = await commands.createAgentWithOptions(
      {
        channelId: 'dune-chat',
        name: suggestedName,
        projectId: selectedProjectId,
        projectName: selectedProject?.name ?? null,
        projectRootPath: selectedProject?.rootPath ?? null,
      },
      { openRoute: false },
    );

    await handleAssignPrimaryAgent(itemId, {
      agentId,
      agentName: suggestedName,
    });
  };

  /** Handles project from settings deletion. */
  const handleDeleteProjectFromSettings = async () => {
    if (!selectedProject) {
      return;
    }

    projectAgents.forEach((agent) => {
      clearAgentAssignments(agent.id);
    });
    await Promise.all(projectAgents.map((agent) => agentRuntime.service.deleteAgent(agent.id)));
    deleteProject(selectedProject.id);
    setDeleteProjectOpen(false);
  };

  const projectSettingsInspector = selectedProject ? (
    <WorkflowProjectSettings
      className={
        isCompactShell
          ? 'app-no-drag h-full'
          : 'h-full border-l border-app-border'
      }
      onCancel={closeProjectSettings}
      onDelete={() => setDeleteProjectOpen(true)}
      onOpenPath={(targetPath) => window.duneDesktop?.openPath?.(targetPath)}
      onPickRootPath={() => window.duneDesktop?.selectProjectDirectory?.() ?? Promise.resolve(null)}
      onSave={async (input) => {
        if (input.rootPath) {
          const artifactFolderNames = useAppStore
            .getState()
            .items
            .filter((item) => item.projectId === selectedProject.id)
            .map((item) => item.artifactFolderName);

          await window.duneDesktop?.prepareProjectRootPath?.(input.rootPath, artifactFolderNames);
        }

        updateProject(selectedProject.id, input);
        await agentRuntime.service.ensureProjectMainAgent(
          selectedProject.id,
          input.name ?? selectedProject.name,
          input.rootPath ?? selectedProject.rootPath,
        );
        closeProjectSettings();
      }}
      presentation={isCompactShell ? 'drawer' : 'inline'}
      project={selectedProject}
    />
  ) : null;

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
            {isSettingsScreen ? (
              projectSettingsInspector
            ) : (
              <WorkflowItemInspector
                item={selectedItem}
                onAddTask={(itemId, title) => {
                  addTask(itemId, title);
                }}
                onAssignPrimaryAgent={(itemId, input) => {
                  void handleAssignPrimaryAgent(itemId, input);
                }}
                onCreateAgent={(itemId) => {
                  void handleCreateAgentForItem(itemId);
                }}
                onOpenAgent={(agentId) => commands.setPopoverAgentId(agentId)}
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
            )}
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
      onAssignPrimaryAgent={(itemId, input) => {
        void handleAssignPrimaryAgent(itemId, input);
      }}
      onCreateAgent={(itemId) => {
        void handleCreateAgentForItem(itemId);
      }}
      onOpenAgent={(agentId) => commands.setPopoverAgentId(agentId)}
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
          showSidebarToggle={showCompactSidebarToggle}
        />
      ) : null}

      {projects.length === 0 || !selectedProject
        ? emptyState
        : (
          <div className="workflow-page-shell flex min-h-0 flex-1 flex-col overflow-hidden px-6 pb-6 pt-5">
            <>
              <div className="workflow-project-header-row flex flex-wrap items-center justify-between gap-4 border-b border-app-border pb-5">
                <div className="workflow-project-header-copy min-w-0">
                  <h2 className="workflow-project-title surface-title">
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
                          onClick={() => {
                            if (tab.value === 'activity') {
                              commands.openProjectActivity();
                              return;
                            }

                            if (tab.value === 'agents') {
                              commands.openAgents();
                              return;
                            }

                            commands.openWorkflow();
                          }}
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
                  {isBoardView && !showTitlebarProjectCreateAction ? (
                    <Button
                      onClick={() => onCreateWorkItemOpenChange(true)}
                      type="button"
                    >
                      <Plus className="h-4 w-4" />
                      New work item
                    </Button>
                  ) : null}
                  {isAgentsView && !showTitlebarProjectCreateAction ? (
                    <Button
                      disabled={isProjectAgentsInitializing}
                      onClick={onOpenCreateAgent}
                      title={isProjectAgentsInitializing ? 'Agents are still initializing' : undefined}
                      type="button"
                    >
                      <Plus className="h-4 w-4" />
                      New agent
                    </Button>
                  ) : null}
                  {!showTitlebarProjectActions ? <WorkflowProjectActionsMenu /> : null}
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
                    onOpenAgent={commands.setPopoverAgentId}
                    onOpenItem={(itemId) => {
                      commands.openItem(itemId);
                    }}
                    runtimeInfo={runtimeInfo}
                  />
                ) : (
                  <WorkflowProjectActivity
                    entries={activityEntries}
                    onOpenItem={(itemId) => {
                      commands.openItem(itemId);
                    }}
                  />
                )}
              </div>
            </>
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
          !isSettingsScreen &&
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

      <Dialog
        onOpenChange={(open) => {
          if (!open) {
            closeProjectSettings();
          }
        }}
        open={isCompactShell && isSettingsScreen && !!selectedProject}
      >
        <DialogContent
          className="shell-context-drawer"
          data-dialog-motion="drawer"
          overlayProps={{
            'data-testid': 'workflow-project-settings-overlay',
            onClick: closeProjectSettings,
          }}
        >
          <DialogTitle className="sr-only">Project settings</DialogTitle>
          <DialogDescription className="sr-only">
            Inspect and manage the current project.
          </DialogDescription>
          <DialogClose asChild>
            <Button
              aria-label="Close project settings"
              className="absolute right-4 top-4 z-10"
              size="icon"
              type="button"
              variant="quiet"
            >
              <X className="h-4 w-4" />
            </Button>
          </DialogClose>
          {projectSettingsInspector}
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
                void handleDeleteProjectFromSettings();
              }}
              type="button"
            >
              Delete project
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <CreateProjectDialog
        onCreateProject={async (input) => {
          await window.duneDesktop?.prepareProjectRootPath?.(input.rootPath, []);
          const projectId = createProject(input);

          if (projectId) {
            const mainAgentId = await agentRuntime.service.ensureProjectMainAgent(
              projectId,
              input.name,
              input.rootPath,
            );

            // Open popover with the project-main agent and trigger kickoff
            commands.setPopoverAgentId(mainAgentId);
            try {
              await agentRuntime.service.sendMessage(
                mainAgentId,
                'Project created. Run /dune-project-kickoff to introduce yourself and help the user get started.',
              );
            } catch {
              // Agent may not be ready yet — popover still opens for manual interaction
            }
          }

          onCreateProjectOpenChange(false);
        }}
        onOpenChange={onCreateProjectOpenChange}
        onSelectProjectDirectory={() => window.duneDesktop?.selectProjectDirectory?.() ?? Promise.resolve(null)}
        open={isCreateProjectOpen}
      />

      <CreateWorkItemDialog
        initialProjectId={selectedProjectId}
        onCreateItem={(input) => {
          const itemId = createItem(input);

          if (itemId) {
            const state = useAppStore.getState();
            const item = state.items.find((candidate) => candidate.id === itemId) ?? null;
            const project = state.projects.find((candidate) => candidate.id === input.projectId) ?? null;

            if (item?.artifactFolderName && project?.rootPath) {
              void window.duneDesktop?.ensureProjectArtifactFolder?.(
                project.rootPath,
                item.artifactFolderName,
              );
            }
          }

          onCreateWorkItemOpenChange(false);
        }}
        onOpenChange={onCreateWorkItemOpenChange}
        open={isCreateWorkItemOpen}
        projects={projects}
      />
    </>
  );
}
