// Main app shell UI and workspace routing.

import {
  type CSSProperties,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Menu,
  Minimize2,
  PanelRight,
  SquarePen,
} from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';

import { AgentChatPopover } from '@/renderer/features/agents/components/AgentChatPopover';
import { CreateAgentDialog } from '@/renderer/features/agents/components/CreateAgentDialog';
import { selectAgentById, presentAgent } from '@/renderer/features/agents/model/agent-presenters';
import { agentRuntime } from '@/renderer/features/agents/runtime/agent-runtime';
import { useAgentSubmit } from '@/renderer/app/hooks/use-agent-submit';
import { useAgentShellController } from '@/renderer/app/hooks/use-agent-shell-controller';
import { useComposerFocus } from '@/renderer/app/hooks/use-composer-focus';
import { useResizableContextPanel } from '@/renderer/app/hooks/use-resizable-context-panel';
import { useResizableSidebar } from '@/renderer/app/hooks/use-resizable-sidebar';
import { useGlobalShortcuts } from '@/renderer/app/hooks/use-global-shortcuts';
import { useResponsiveShell } from '@/renderer/app/hooks/use-responsive-shell';
import { useThemeSync } from '@/renderer/app/hooks/use-theme-sync';
import { useTranscriptScroll } from '@/renderer/app/hooks/use-transcript-scroll';
import { useWindowControlsOverlay } from '@/renderer/app/hooks/use-window-controls-overlay';
import { useWorkflowPersistence } from '@/renderer/app/hooks/use-workflow-persistence';
import { AppSidebar } from '@/renderer/app/shell/AppSidebar';
import { ContextPanelHost } from '@/renderer/app/shell/ContextPanelHost';
import { SidebarDrawer } from '@/renderer/app/shell/SidebarDrawer';
import { CommandPalette } from '@/renderer/components/CommandPalette';
import { createDefaultWorkItemFilters } from '@/renderer/utils/SearchIndex';
import { useAppCommands } from '@/renderer/app/store/app-commands';
import {
  useAgentSession,
  useSettingsState,
  useShellState,
  useWorkflowSession,
} from '@/renderer/app/store/selectors';
import { useAppStore } from '@/renderer/app/store/use-app-store';
import { AgentWorkspace } from '@/renderer/app/workspaces/AgentWorkspace';
import { SettingsWorkspace } from '@/renderer/app/workspaces/SettingsWorkspace';
import { WorkflowWorkspace } from '@/renderer/app/workspaces/WorkflowWorkspace';
import { PluginsWorkspace } from '@/renderer/app/workspaces/PluginsWorkspace';
import { useDesktopPlatform } from '@/renderer/shared/lib/use-desktop-platform';
import { cn } from '@/renderer/shared/lib/utils';
import { Button } from '@/renderer/shared/ui/button';
import { TooltipProvider } from '@/renderer/shared/ui/tooltip';
import { WorkflowProjectActionsMenu } from '@/renderer/features/workflow/components/WorkflowProjectActionsMenu';
import {
  MAC_TITLEBAR_OVERLAY_HEIGHT,
  MAC_TITLEBAR_SIDEBAR_TOGGLE_GAP,
  MAC_TITLEBAR_SIDEBAR_TOGGLE_SIZE,
} from '@/shared/window/titlebar';

/** Window shell style shape. */
type WindowShellStyle = CSSProperties & {
  '--app-drag-strip-height'?: string;
  '--app-shell-titlebar-toggle-left'?: string;
  '--app-shell-titlebar-toggle-top'?: string;
};

/** Renders the app shell UI. */
export default function AppShell() {
  const transcriptRef = useRef<HTMLDivElement | null>(null);
  const [isCreateWorkItemOpen, setCreateWorkItemOpen] = useState(false);
  const [isCreateProjectOpen, setCreateProjectOpen] = useState(false);
  const [loadingTranscriptAgentId, setLoadingTranscriptAgentId] = useState<string | null>(null);
  const [workItemFilters, setWorkItemFilters] = useState(createDefaultWorkItemFilters);
  const { composerRef, focusComposer } = useComposerFocus();
  const { isMac } = useDesktopPlatform();
  const commands = useAppCommands();
  const {
    activeAgent,
    activeAgentCustomization,
    draft,
    externalChannels,
    runtimeInfo,
  } = useAgentSession();
  const {
    projectAgents,
    projects,
    selectedProject,
    selectedProjectId,
    selectedProjectScreen,
    selectedProjectView,
  } = useWorkflowSession();
  const {
    canNavigateBack,
    canNavigateForward,
    isCommandOpen,
    isContextPanelOpen,
    popoverAgentId,
    route,
  } = useShellState();
  const {
    runtimeInfo: settingsRuntimeInfo,
    settingsRoute,
    themePreference,
  } = useSettingsState();
  const {
    agents,
    appendTranscriptPage,
    clearAgentAssignments,
    items,
  } = useAppStore(
    useShallow((state) => ({
      agents: state.agents,
      appendTranscriptPage: state.appendTranscriptPage,
      clearAgentAssignments: state.clearAgentAssignments,
      items: state.items,
    })),
  );
  const showContextPanel = route === 'agent' && isContextPanelOpen && !!activeAgent;
  const titlebarAreaRect = useWindowControlsOverlay(isMac);
  const { isCompactShell, usesInlineContext, usesOverlayContext } =
    useResponsiveShell(showContextPanel, isMac && !!titlebarAreaRect);
  const {
    contextPanelStyle,
    isResizing: isContextPanelResizing,
    resizeHandleProps: contextPanelResizeHandleProps,
  } = useResizableContextPanel({
    enabled: !isCompactShell && usesInlineContext,
  });
  const {
    isResizing: isSidebarResizing,
    resizeHandleProps,
    sidebarStyle,
  } = useResizableSidebar({
    enabled: !isCompactShell,
  });

  useThemeSync(themePreference);
  useWorkflowPersistence();

  useEffect(() => {
    if (projects.length === 0) {
      return;
    }

    void Promise.all(
      projects.map((project) =>
        agentRuntime.service.ensureProjectMainAgent(project.id, project.name, project.rootPath),
      ),
    ).catch((error) => {
      console.error('Failed to reconcile project main agents.', error);
    });
  }, [projects]);

  useTranscriptScroll({
    agent: activeAgent,
    route,
    transcriptRef,
  });

  const handleSubmit = useAgentSubmit({ focusComposer });
  const controller = useAgentShellController({
    activeAgent,
    commands,
    focusComposer,
    isCompactShell,
    route,
  });
  /** Handles active agent deletion. */
  const handleDeleteActiveAgent = async () => {
    if (!activeAgent) {
      return;
    }

    clearAgentAssignments(activeAgent.id);
    commands.toggleInspector(false);

    if (activeAgent.projectId) {
      commands.openAgents(activeAgent.projectId);
    } else {
      commands.openWorkflow();
    }

    await agentRuntime.service.deleteAgent(activeAgent.id);
  };
  /** Loads one older transcript page for the active agent. */
  const handleLoadOlderMessages = async () => {
    if (!activeAgent || !activeAgent.transcript.hasOlderMessages) {
      return;
    }

    const beforeMessageId = activeAgent.messages[0]?.id ?? null;
    setLoadingTranscriptAgentId(activeAgent.id);

    try {
      const page = await agentRuntime.service.getTranscriptPage(activeAgent.id, {
        beforeMessageId,
        limit: 80,
      });
      appendTranscriptPage(page);
    } catch (error) {
      console.error(`Failed to load older transcript messages for "${activeAgent.name}".`, error);
    } finally {
      setLoadingTranscriptAgentId((currentAgentId) =>
        currentAgentId === activeAgent.id ? null : currentAgentId,
      );
    }
  };
  const sidebarProps = {
    isCommandOpen,
    onOpenCommand: controller.handleOpenCommand,
    route,
    workflow: {
      onCreateProject: () => {
        controller.handleSidebarDrawerOpenChange(false);
        setCreateProjectOpen(true);
      },
      onOpenPlugins: () => {
        controller.handleSidebarDrawerOpenChange(false);
        commands.openPlugins();
      },
      onOpenSettings: controller.handleOpenSettings,
      onSelectProject: (projectId: string) => {
        controller.handleSidebarDrawerOpenChange(false);
        commands.openWorkflow(projectId);
      },
      projects,
      selectedProjectId,
    },
  };
  const sidebar = (className: string, options?: { showQuickSwitch?: boolean }) => (
    <AppSidebar
      {...sidebarProps}
      className={className}
      {...(options?.showQuickSwitch !== undefined
        ? { showQuickSwitch: options.showQuickSwitch }
        : {})}
    />
  );
  const shellStyle = isCompactShell
    ? contextPanelStyle
    : {
        ...sidebarStyle,
        ...contextPanelStyle,
      };
  const showNativeTitlebarSidebarToggle = isMac && isCompactShell && !!titlebarAreaRect;
  const showNativeTitlebarInspectorToggle =
    showNativeTitlebarSidebarToggle && route === 'agent' && !!activeAgent;
  const showNativeTitlebarAgentTitle =
    showNativeTitlebarSidebarToggle &&
    route === 'agent' &&
    !!activeAgent;
  const showNativeTitlebarWorkflowTitle =
    showNativeTitlebarSidebarToggle &&
    route === 'workflow' &&
    !!selectedProject;
  const showNativeTitlebarProjectActions =
    showNativeTitlebarSidebarToggle &&
    route === 'workflow' &&
    selectedProjectScreen === 'main' &&
    !!selectedProject;
  const showNativeTitlebarProjectCreateAction =
    showNativeTitlebarSidebarToggle &&
    route === 'workflow' &&
    selectedProjectScreen === 'main' &&
    !!selectedProject &&
    (selectedProjectView === 'board' || selectedProjectView === 'agents');
  const isProjectAgentsInitializing =
    selectedProjectView === 'agents' &&
    runtimeInfo.status === 'starting' &&
    projectAgents.length === 0;
  const showCompactSidebarToggle = !showNativeTitlebarSidebarToggle;
  const windowShellStyle: WindowShellStyle | undefined = titlebarAreaRect
    ? {
        '--app-drag-strip-height': `${Math.max(
          MAC_TITLEBAR_OVERLAY_HEIGHT,
          titlebarAreaRect.y + titlebarAreaRect.height,
        )}px`,
        '--app-shell-titlebar-toggle-left': `${titlebarAreaRect.x + MAC_TITLEBAR_SIDEBAR_TOGGLE_GAP}px`,
        '--app-shell-titlebar-toggle-top': `${titlebarAreaRect.y + ((titlebarAreaRect.height - MAC_TITLEBAR_SIDEBAR_TOGGLE_SIZE) / 2)}px`,
      }
    : undefined;

  useGlobalShortcuts({
    isCommandOpen,
    isMac,
    onCloseCommand: controller.handleCloseCommand,
    onCloseContextPanel: controller.handleCloseContextPanel,
    onCreateAgent: controller.handleOpenCreateAgent,
    onCreateItem: () => {
      if (selectedProjectId) {
        setCreateWorkItemOpen(true);
        return;
      }

      setCreateProjectOpen(true);
    },
    onCreateProject: () => setCreateProjectOpen(true),
    onCycleAgent: commands.cycleAgent,
    onOpenCommand: controller.handleOpenCommand,
    onOpenSettings: controller.handleOpenSettings,
    onToggleContextPanel: controller.handleToggleContextPanel,
    route,
    usesOverlayContext,
  });

  return (
    <TooltipProvider delayDuration={120}>
      <div
        className="window-shell window-shell-grid text-app-text shell-reveal"
        data-native-titlebar-agent-title={showNativeTitlebarAgentTitle ? 'true' : undefined}
        data-native-titlebar-overlay={showNativeTitlebarSidebarToggle ? 'true' : undefined}
        data-native-titlebar-workflow-title={showNativeTitlebarWorkflowTitle ? 'true' : undefined}
        style={windowShellStyle}
      >
        <div className="titlebar-row">
          {showNativeTitlebarSidebarToggle ? (
            <div
              className="titlebar-sidebar-toggle-slot app-no-drag"
              data-testid="titlebar-sidebar-toggle-slot"
            >
              <Button
                aria-expanded={controller.isSidebarDrawerOpen}
                aria-label={controller.isSidebarDrawerOpen ? 'Close sidebar' : 'Open sidebar'}
                className="app-no-drag shrink-0"
                data-testid="titlebar-sidebar-toggle"
                onClick={controller.handleToggleSidebar}
                size="icon"
                type="button"
                variant="quiet"
              >
                <Menu className="h-4 w-4" />
              </Button>
            </div>
          ) : null}

          {showNativeTitlebarSidebarToggle ? (
            <div
              className="titlebar-navigation-slot app-no-drag"
              data-testid="titlebar-navigation-slot"
            >
              <Button
                aria-label="Go back"
                className="app-no-drag shrink-0"
                data-testid="titlebar-nav-back"
                disabled={!canNavigateBack}
                onClick={commands.goBack}
                size="icon"
                type="button"
                variant="quiet"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <Button
                aria-label="Go forward"
                className="app-no-drag shrink-0"
                data-testid="titlebar-nav-forward"
                disabled={!canNavigateForward}
                onClick={commands.goForward}
                size="icon"
                type="button"
                variant="quiet"
              >
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          ) : null}

          {showNativeTitlebarAgentTitle ? (
            <div
              aria-hidden="true"
              className="titlebar-workflow-title"
              data-testid="titlebar-agent-title"
            >
              <h2 className="titlebar-workflow-title-copy truncate">
                {activeAgent.name}
              </h2>
            </div>
          ) : null}

          {showNativeTitlebarWorkflowTitle ? (
            <div
              aria-hidden="true"
              className="titlebar-workflow-title"
              data-testid="titlebar-workflow-title"
            >
              <h2 className="titlebar-workflow-title-copy truncate">
                {selectedProject.name}
              </h2>
            </div>
          ) : null}

          <div className="window-drag-strip" data-testid="window-drag-region" />

          {showNativeTitlebarProjectCreateAction ? (
            <div
              className="titlebar-create-action-slot app-no-drag"
              data-testid="titlebar-project-create-slot"
            >
              <Button
                aria-label={selectedProjectView === 'agents' ? 'New agent' : 'New work item'}
                className="app-no-drag shrink-0"
                data-testid="titlebar-project-create-button"
                disabled={isProjectAgentsInitializing}
                onClick={
                  selectedProjectView === 'agents'
                    ? controller.handleOpenCreateAgent
                    : () => setCreateWorkItemOpen(true)
                }
                size="icon"
                title={isProjectAgentsInitializing ? 'Agents are still initializing' : undefined}
                type="button"
                variant="quiet"
              >
                <SquarePen className="h-4 w-4" />
              </Button>
            </div>
          ) : null}

          {showNativeTitlebarInspectorToggle || showNativeTitlebarProjectActions ? (
            <div
              className="titlebar-inspector-toggle-slot app-no-drag"
              data-testid={showNativeTitlebarInspectorToggle ? 'titlebar-inspector-toggle-slot' : 'titlebar-project-actions-slot'}
            >
              {showNativeTitlebarInspectorToggle ? (
                <div className="flex items-center gap-1">
                  {route === 'agent' && activeAgent ? (
                    <Button
                      aria-label="Minimize to popover"
                      className="app-no-drag shrink-0"
                      onClick={() => {
                        commands.setPopoverAgentId(activeAgent.id);
                        if (canNavigateBack) {
                          commands.goBack();
                        } else {
                          commands.openWorkflow();
                        }
                      }}
                      size="icon"
                      type="button"
                      variant="quiet"
                    >
                      <Minimize2 className="h-4 w-4" />
                    </Button>
                  ) : null}
                  <Button
                    aria-label={isContextPanelOpen ? 'Hide inspector' : 'Show inspector'}
                    className="app-no-drag shrink-0"
                    data-testid="titlebar-inspector-toggle"
                    onClick={controller.handleToggleContextPanel}
                    size="icon"
                    type="button"
                    variant="quiet"
                  >
                    <PanelRight className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <WorkflowProjectActionsMenu
                  className="app-no-drag shrink-0"
                  presentation="drawer"
                />
              )}
            </div>
          ) : null}
        </div>

        <div
          aria-hidden="true"
          className="titlebar-row-spacer"
        />

        <div
          className={cn(
            'relative z-10 grid h-full min-h-0 min-w-0 grid-rows-[minmax(0,1fr)] overflow-hidden',
            isCompactShell
              ? 'grid-cols-[minmax(0,1fr)]'
              : usesInlineContext
                ? 'grid-cols-[var(--app-shell-sidebar-width)_minmax(0,1fr)_var(--app-shell-context-width)]'
                : 'grid-cols-[var(--app-shell-sidebar-width)_minmax(0,1fr)]',
          )}
          data-testid="app-shell-layout"
          style={shellStyle}
        >
          {!isCompactShell ? (
            <div className="relative min-h-0 min-w-0">
              {sidebar('h-full border-r border-app-border')}
              <div
                {...resizeHandleProps}
                className="sidebar-resize-handle"
                data-resizing={isSidebarResizing}
              />
            </div>
          ) : null}

          <main className="panel-reveal flex min-h-0 min-w-0 flex-col overflow-hidden">
            {route === 'agent' ? (
              <AgentWorkspace
                agent={activeAgent}
                composerRef={composerRef}
                draft={draft}
                isCompactShell={isCompactShell}
                isContextPanelOpen={isContextPanelOpen}
                isSidebarOpen={controller.isSidebarDrawerOpen}
                onCreateAgent={controller.handleOpenCreateAgent}
                onDraftChange={commands.setDraft}
                onLoadOlderMessages={handleLoadOlderMessages}
                onSubmit={handleSubmit}
                onToggleInspector={controller.handleToggleContextPanel}
                onToggleSidebar={controller.handleToggleSidebar}
                runtimeInfo={runtimeInfo}
                showCompactInspectorToggle={!showNativeTitlebarInspectorToggle}
                showCompactSidebarToggle={showCompactSidebarToggle}
                isLoadingOlderMessages={loadingTranscriptAgentId === activeAgent?.id}
                transcriptRef={transcriptRef}
              />
            ) : route === 'workflow' ? (
              <WorkflowWorkspace
                filters={workItemFilters}
                isCompactShell={isCompactShell}
                isCreateProjectOpen={isCreateProjectOpen}
                isCreateWorkItemOpen={isCreateWorkItemOpen}
                onFiltersChange={setWorkItemFilters}
                isSidebarOpen={controller.isSidebarDrawerOpen}
                onCreateProjectOpenChange={setCreateProjectOpen}
                onCreateWorkItemOpenChange={setCreateWorkItemOpen}
                onOpenCreateAgent={controller.handleOpenCreateAgent}
                onToggleSidebar={controller.handleToggleSidebar}
                runtimeInfo={runtimeInfo}
                showCompactSidebarToggle={showCompactSidebarToggle}
                showTitlebarProjectCreateAction={showNativeTitlebarProjectCreateAction}
                showTitlebarProjectActions={showNativeTitlebarProjectActions}
              />
            ) : route === 'plugins' ? (
              <PluginsWorkspace
                isCompactShell={isCompactShell}
                isSidebarOpen={controller.isSidebarDrawerOpen}
                onToggleSidebar={controller.handleToggleSidebar}
                showCompactSidebarToggle={showCompactSidebarToggle}
              />
            ) : (
              <SettingsWorkspace
                agents={agents}
                externalChannels={externalChannels}
                isCompactShell={isCompactShell}
                isSidebarOpen={controller.isSidebarDrawerOpen}
                onSelectRoute={commands.setSettingsRoute}
                onThemeChange={commands.setThemePreference}
                onToggleSidebar={controller.handleToggleSidebar}
                runtimeInfo={settingsRuntimeInfo}
                settingsRoute={settingsRoute}
                showCompactSidebarToggle={showCompactSidebarToggle}
                themePreference={themePreference}
              />
            )}
          </main>

          <ContextPanelHost
            agent={activeAgent}
            customization={activeAgentCustomization}
            inlineResizeHandleProps={contextPanelResizeHandleProps}
            isInlineResizing={isContextPanelResizing}
            mode={
              route !== 'agent' || !activeAgent
                ? 'hidden'
                : usesInlineContext
                  ? 'inline'
                  : usesOverlayContext
                    ? 'overlay'
                    : 'hidden'
            }
            onClose={controller.handleCloseContextPanel}
            onDeleteAgent={handleDeleteActiveAgent}
          />
        </div>

        <SidebarDrawer
          isOpen={isCompactShell && controller.isSidebarDrawerOpen}
          onOpenChange={controller.handleSidebarDrawerOpenChange}
          sidebar={sidebar('h-full rounded-[24px]', { showQuickSwitch: false })}
        />

        <CommandPalette
          agents={agents}
          filters={workItemFilters}
          items={items}
          onFiltersChange={setWorkItemFilters}
          onOpenChange={commands.setCommandOpen}
          onSelectItem={(itemId, projectId) => {
            commands.openWorkflow(projectId);
            commands.openItem(itemId);
          }}
          open={isCommandOpen}
        />

        <CreateAgentDialog
          defaultProjectId={selectedProjectId}
          existingAgents={agents}
          externalChannels={externalChannels}
          onCreateAgent={controller.handleCreateAgent}
          onOpenChange={controller.handleCreateAgentDialogOpenChange}
          open={controller.isCreateAgentOpen}
          projects={projects}
        />

        {popoverAgentId && (() => {
          const agent = selectAgentById(agents, popoverAgentId);
          if (!agent) return null;
          return (
            <AgentChatPopover
              agent={presentAgent(agent)}
              onClose={() => commands.setPopoverAgentId(null)}
              onExpand={() => {
                commands.setPopoverAgentId(null);
                commands.openAgent(popoverAgentId);
              }}
            />
          );
        })()}
      </div>
    </TooltipProvider>
  );
}
