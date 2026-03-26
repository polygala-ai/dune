import {
  useRef,
} from 'react';

import { CreateAgentDialog } from '@/renderer/features/agents/components/CreateAgentDialog';
import { useAgentSubmit } from '@/renderer/app/hooks/use-agent-submit';
import { useAgentShellController } from '@/renderer/app/hooks/use-agent-shell-controller';
import { useComposerFocus } from '@/renderer/app/hooks/use-composer-focus';
import { useResizableSidebar } from '@/renderer/app/hooks/use-resizable-sidebar';
import { useGlobalShortcuts } from '@/renderer/app/hooks/use-global-shortcuts';
import { useResponsiveShell } from '@/renderer/app/hooks/use-responsive-shell';
import { useThemeSync } from '@/renderer/app/hooks/use-theme-sync';
import { useTranscriptScroll } from '@/renderer/app/hooks/use-transcript-scroll';
import { AppSidebar } from '@/renderer/app/shell/AppSidebar';
import { CommandMenu } from '@/renderer/app/shell/CommandMenu';
import { ContextPanelHost } from '@/renderer/app/shell/ContextPanelHost';
import { SidebarDrawer } from '@/renderer/app/shell/SidebarDrawer';
import { useAppCommands } from '@/renderer/app/store/app-commands';
import {
  useAgentSession,
  useSettingsState,
  useShellState,
} from '@/renderer/app/store/selectors';
import { AgentWorkspace } from '@/renderer/app/workspaces/AgentWorkspace';
import { SettingsWorkspace } from '@/renderer/app/workspaces/SettingsWorkspace';
import { useDesktopPlatform } from '@/renderer/shared/lib/use-desktop-platform';
import { cn } from '@/renderer/shared/lib/utils';
import { TooltipProvider } from '@/renderer/shared/ui/tooltip';

export default function AppShell() {
  const transcriptRef = useRef<HTMLDivElement | null>(null);
  const { composerRef, focusComposer } = useComposerFocus();
  const { isMac } = useDesktopPlatform();
  const commands = useAppCommands();
  const {
    activeAgent,
    agentSummaries,
    commandAgents,
    draft,
    isStreaming,
    runtimeInfo,
    selectedAgentId,
  } = useAgentSession();
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
  const showContextPanel = route === 'agent' && isContextPanelOpen && !!activeAgent;
  const { isCompactShell, usesInlineContext, usesOverlayContext } =
    useResponsiveShell(showContextPanel);
  const {
    isResizing: isSidebarResizing,
    resizeHandleProps,
    sidebarStyle,
  } = useResizableSidebar({
    enabled: !isCompactShell,
  });

  useThemeSync(themePreference);

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
    agents: agentSummaries,
    isCommandOpen,
    onCreateAgent: controller.handleOpenCreateAgent,
    onOpenCommand: controller.handleOpenCommand,
    onOpenSettings: controller.handleOpenSettings,
    onSelectAgent: controller.handleSelectAgent,
    route,
    selectedAgentId,
  };
  const sidebar = (className: string) => (
    <AppSidebar
      {...sidebarProps}
      className={className}
    />
  );

  useGlobalShortcuts({
    isCommandOpen,
    isMac,
    onCloseCommand: controller.handleCloseCommand,
    onCloseContextPanel: controller.handleCloseContextPanel,
    onCreateAgent: controller.handleOpenCreateAgent,
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
          style={!isCompactShell ? sidebarStyle : undefined}
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
            ) : (
              <SettingsWorkspace
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
          sidebar={sidebar('h-full rounded-[24px]')}
        />

        <CommandMenu
          agents={commandAgents}
          isContextPanelOpen={isContextPanelOpen}
          onCreateAgent={controller.handleOpenCreateAgent}
          onOpenChange={commands.setCommandOpen}
          onOpenSettings={controller.handleOpenSettings}
          onSelectAgent={controller.handleSelectAgent}
          onToggleContextPanel={controller.handleToggleContextPanel}
          open={isCommandOpen}
        />

        <CreateAgentDialog
          onCreateAgent={controller.handleCreateAgent}
          onOpenChange={controller.handleCreateAgentDialogOpenChange}
          onOpenChannelsSettings={controller.handleOpenChannelsSettings}
          open={controller.isCreateAgentOpen}
        />
      </div>
    </TooltipProvider>
  );
}
