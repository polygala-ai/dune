import {
  useRef,
  useState,
} from 'react';
import { useShallow } from 'zustand/react/shallow';

import { CreateAgentDialog } from '@/renderer/features/agents/components/CreateAgentDialog';
import { useAgentSubmit } from '@/renderer/app/hooks/use-agent-submit';
import { useAgentShellController } from '@/renderer/app/hooks/use-agent-shell-controller';
import { useComposerFocus } from '@/renderer/app/hooks/use-composer-focus';
import { useResizableContextPanel } from '@/renderer/app/hooks/use-resizable-context-panel';
import { useResizableSidebar } from '@/renderer/app/hooks/use-resizable-sidebar';
import { useGlobalShortcuts } from '@/renderer/app/hooks/use-global-shortcuts';
import { useResponsiveShell } from '@/renderer/app/hooks/use-responsive-shell';
import { useThemeSync } from '@/renderer/app/hooks/use-theme-sync';
import { useTranscriptScroll } from '@/renderer/app/hooks/use-transcript-scroll';
import { useWorkflowPersistence } from '@/renderer/app/hooks/use-workflow-persistence';
import { AppSidebar } from '@/renderer/app/shell/AppSidebar';
import { CommandMenu } from '@/renderer/app/shell/CommandMenu';
import { ContextPanelHost } from '@/renderer/app/shell/ContextPanelHost';
import { SidebarDrawer } from '@/renderer/app/shell/SidebarDrawer';
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
import { TooltipProvider } from '@/renderer/shared/ui/tooltip';

export default function AppShell() {
  const transcriptRef = useRef<HTMLDivElement | null>(null);
  const [isCreateWorkItemOpen, setCreateWorkItemOpen] = useState(false);
  const [isCreateProjectOpen, setCreateProjectOpen] = useState(false);
  const { composerRef, focusComposer } = useComposerFocus();
  const { isMac } = useDesktopPlatform();
  const commands = useAppCommands();
  const {
    activeAgent,
    commandAgents,
    draft,
    externalChannels,
    isStreaming,
    runtimeInfo,
  } = useAgentSession();
  const {
    activityEntries,
    filteredItemSummaries,
    projects,
    selectedProjectId,
  } = useWorkflowSession();
  const {
    isCommandOpen,
    isContextPanelOpen,
    route,
  } = useShellState();
  const {
    runtimeInfo: settingsRuntimeInfo,
    settingsRoute,
    themePreference,
  } = useSettingsState();
  const {
    agents,
    selectProject,
  } = useAppStore(
    useShallow((state) => ({
      agents: state.agents,
      selectProject: state.selectProject,
    })),
  );
  const showContextPanel = route === 'agent' && isContextPanelOpen && !!activeAgent;
  const { isCompactShell, usesInlineContext, usesOverlayContext } =
    useResponsiveShell(showContextPanel);
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
        selectProject(projectId);
        commands.openWorkflow();
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
      <div className="window-shell window-shell-grid text-app-text shell-reveal">
        <div className="window-drag-strip" data-testid="window-drag-region" />

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
                isStreaming={isStreaming}
                onCreateAgent={controller.handleOpenCreateAgent}
                onDraftChange={commands.setDraft}
                onSubmit={handleSubmit}
                onToggleInspector={controller.handleToggleContextPanel}
                onToggleSidebar={controller.handleToggleSidebar}
                runtimeInfo={runtimeInfo}
                transcriptRef={transcriptRef}
              />
            ) : route === 'workflow' ? (
              <WorkflowWorkspace
                isCompactShell={isCompactShell}
                isCreateProjectOpen={isCreateProjectOpen}
                isCreateWorkItemOpen={isCreateWorkItemOpen}
                isSidebarOpen={controller.isSidebarDrawerOpen}
                onCreateProjectOpenChange={setCreateProjectOpen}
                onCreateWorkItemOpenChange={setCreateWorkItemOpen}
                onOpenCreateAgent={controller.handleOpenCreateAgent}
                onToggleSidebar={controller.handleToggleSidebar}
              />
            ) : route === 'plugins' ? (
              <PluginsWorkspace
                isCompactShell={isCompactShell}
                isSidebarOpen={controller.isSidebarDrawerOpen}
                onToggleSidebar={controller.handleToggleSidebar}
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
                themePreference={themePreference}
              />
            )}
          </main>

          <ContextPanelHost
            agent={activeAgent}
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
          />
        </div>

        <SidebarDrawer
          isOpen={isCompactShell && controller.isSidebarDrawerOpen}
          onOpenChange={controller.handleSidebarDrawerOpenChange}
          sidebar={sidebar('h-full rounded-[24px]', { showQuickSwitch: false })}
        />

        <CommandMenu
          agents={commandAgents.filter((agent) =>
            selectedProjectId ? agent.projectId === selectedProjectId : true,
          )}
          isContextPanelOpen={isContextPanelOpen}
          items={filteredItemSummaries.map((item) => ({
            id: item.id,
            statusLabel: item.statusLabel,
            title: item.title,
            updatedLabel: item.updatedLabel,
          }))}
          onCreateAgent={controller.handleOpenCreateAgent}
          onCreateItem={() => setCreateWorkItemOpen(true)}
          onCreateProject={() => setCreateProjectOpen(true)}
          onOpenChange={commands.setCommandOpen}
          onOpenBoard={commands.openWorkflow}
          onOpenSettings={controller.handleOpenSettings}
          onSelectAgent={controller.handleSelectAgent}
          onSelectItem={commands.openItem}
          onSelectProject={(projectId) => {
            selectProject(projectId);
            commands.openWorkflow();
          }}
          onToggleContextPanel={controller.handleToggleContextPanel}
          open={isCommandOpen}
          projects={projects}
        />

        <CreateAgentDialog
          defaultProjectId={selectedProjectId}
          existingAgents={agents}
          externalChannels={externalChannels}
          onCreateAgent={controller.handleCreateAgent}
          onOpenChange={controller.handleCreateAgentDialogOpenChange}
          onOpenChannelsSettings={controller.handleOpenChannelsSettings}
          open={controller.isCreateAgentOpen}
          projects={projects}
        />
      </div>
    </TooltipProvider>
  );
}
