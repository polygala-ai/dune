// Workflow workspace UI.

import {
  Plus,
  X,
} from 'lucide-react';
import {
  useMemo,
  useState,
} from 'react';
import { useShallow } from 'zustand/react/shallow';

import { FilterPanel } from '@/renderer/components/FilterPanel';
import {
  filterWorkflowItems,
  type WorkItemFilters,
} from '@/renderer/utils/SearchIndex';
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
import { presentWorkflowEventTimestamp } from '@/renderer/features/workflow/model/workflow-presenters';
import { agentRuntime } from '@/renderer/features/agents/runtime/agent-runtime';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/renderer/shared/ui/dialog';
import { Button } from '@/renderer/shared/ui/button';
import type { AgentRuntimeInfo } from '@/renderer/features/agents/types';
import type { WorkflowProjectActivityEntry } from '@/renderer/features/workflow/types';

const projectHeaderTabs = [
  { label: 'Activity', value: 'activity' },
  { label: 'Board', value: 'board' },
  { label: 'Agents', value: 'agents' },
] as const;

/** Workflow workspace props. */
interface WorkflowWorkspaceProps {
  filters: WorkItemFilters;
  isCompactShell: boolean;
  isCreateProjectOpen: boolean;
  isCreateWorkItemOpen: boolean;
  isSidebarOpen: boolean;
  onCreateProjectOpenChange: (open: boolean) => void;
  onCreateWorkItemOpenChange: (open: boolean) => void;
  onFiltersChange: (filters: WorkItemFilters) => void;
  onOpenCreateAgent: () => void;
  onToggleSidebar: () => void;
  runtimeInfo: AgentRuntimeInfo;
  showCompactSidebarToggle: boolean;
  showTitlebarProjectCreateAction: boolean;
  showTitlebarProjectActions: boolean;
}

/** Renders the workflow workspace UI. */
export function WorkflowWorkspace({
  filters,
  isCompactShell,
  isCreateProjectOpen,
  isCreateWorkItemOpen,
  isSidebarOpen,
  onCreateProjectOpenChange,
  onCreateWorkItemOpenChange,
  onFiltersChange,
  onOpenCreateAgent,
  onToggleSidebar,
  runtimeInfo,
  showCompactSidebarToggle,
  showTitlebarProjectCreateAction,
  showTitlebarProjectActions,
}: WorkflowWorkspaceProps) {
  const commands = useAppCommands();
  const [isFilterPanelOpen, setFilterPanelOpen] = useState(false);
  const [isDeleteProjectOpen, setDeleteProjectOpen] = useState(false);
  const [cachedActivityEntriesByProjectId, setCachedActivityEntriesByProjectId] = useState<Record<string, Array<
    WorkflowProjectActivityEntry & { createdAtLabel: string }
  >>>({});
  const [loadingActivityProjectId, setLoadingActivityProjectId] = useState<string | null>(null);
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
    activitySummary,
    filteredItemSummaries,
    isWorkflowHydrated,
    items,
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
  const cachedActivityEntries = selectedProjectId
    ? cachedActivityEntriesByProjectId[selectedProjectId] ?? []
    : [];
  const mergedActivityEntries = [...new Map(
    [...activityEntries, ...cachedActivityEntries]
      .sort((left, right) => right.createdAt - left.createdAt)
      .map((entry) => [entry.id, entry] as const),
  ).values()];
  const mergedActivitySummary = {
    ...activitySummary,
    hasOlderEntries: mergedActivityEntries.length < activitySummary.totalEntryCount,
  };
  const projectItems = useMemo(
    () => items.filter((item) => item.projectId === selectedProjectId),
    [items, selectedProjectId],
  );
  const filteredItemIds = useMemo(
    () => new Set(filterWorkflowItems(projectItems, filters).map((item) => item.id)),
    [filters, projectItems],
  );
  const boardItemSummaries = filteredItemSummaries.filter((item) => filteredItemIds.has(item.id));
  const filterPanel = (
    <FilterPanel
      agents={projectAgents.map((agent) => ({
        id: agent.id,
        name: agent.name,
      }))}
      filters={filters}
      isOpen={isFilterPanelOpen}
      matchCount={boardItemSummaries.length}
      onChange={onFiltersChange}
      onToggleOpen={() => setFilterPanelOpen((open) => !open)}
      totalCount={projectItems.length}
    />
  );

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

  /** Handles primary agent assignment. Persisting the snapshot triggers the main-process scheduler. */
  const handleAssignPrimaryAgent = (
    itemId: string,
    input: { agentId: string | null; agentName?: string | null },
  ) => {
    assignPrimaryAgent(itemId, input);
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

    handleAssignPrimaryAgent(itemId, {
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

  const handleLoadOlderProjectActivity = async () => {
    if (!selectedProjectId || !window.duneDesktop?.getProjectActivityPage) {
      return;
    }

    setLoadingActivityProjectId(selectedProjectId);

    try {
      const beforeEntryId = mergedActivityEntries.at(-1)?.id ?? null;
      const page = await window.duneDesktop.getProjectActivityPage(selectedProjectId, {
        beforeEntryId,
      });

      setCachedActivityEntriesByProjectId((state) => {
        const existingEntries = state[selectedProjectId] ?? [];
        const nextEntries = [...new Map(
          [
            ...existingEntries,
            ...page.entries.map((entry) => ({
              ...entry,
              createdAtLabel: presentWorkflowEventTimestamp(entry.createdAt),
            })),
          ].map((entry) => [entry.id, entry] as const),
        ).values()].sort((left, right) => right.createdAt - left.createdAt);

        return {
          ...state,
          [selectedProjectId]: nextEntries,
        };
      });
    } finally {
      setLoadingActivityProjectId((current) =>
        current === selectedProjectId ? null : current,
      );
    }
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
        <div className="flex h-full min-h-0 flex-col gap-3">
          {filterPanel}
          <WorkflowBoard
            items={boardItemSummaries}
            onMoveItem={moveItem}
            onSelectItem={(itemId) => {
              selectItem(itemId);
            }}
            selectedItemId={selectedItem?.id ?? null}
          />
        </div>
      ) : (
        <div className="grid h-full min-h-0 gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="flex min-h-0 flex-col gap-3 overflow-hidden">
            {filterPanel}
            <div className="min-h-0 flex-1 overflow-hidden rounded-[28px] border border-app-border bg-app-panel/70 px-4 py-4">
              <WorkflowBoard
                items={boardItemSummaries}
                onMoveItem={moveItem}
                onSelectItem={(itemId) => {
                  selectItem(itemId);
                }}
                selectedItemId={selectedItem?.id ?? null}
              />
            </div>
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
                  handleAssignPrimaryAgent(itemId, input);
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
        handleAssignPrimaryAgent(itemId, input);
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
                    entries={mergedActivityEntries}
                    isLoadingOlderEntries={loadingActivityProjectId === selectedProjectId}
                    onLoadOlderEntries={handleLoadOlderProjectActivity}
                    onOpenItem={(itemId) => {
                      commands.openItem(itemId);
                    }}
                    summary={mergedActivitySummary}
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
