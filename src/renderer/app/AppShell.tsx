import {
  startTransition,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from 'react';

import { useComposerFocus } from '@/renderer/app/hooks/use-composer-focus';
import { useConversationSubmit } from '@/renderer/app/hooks/use-conversation-submit';
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
  useChatSession,
  useSettingsState,
  useShellState,
} from '@/renderer/app/store/selectors';
import { ChatWorkspace } from '@/renderer/app/workspaces/ChatWorkspace';
import { SettingsWorkspace } from '@/renderer/app/workspaces/SettingsWorkspace';
import { useDesktopPlatform } from '@/renderer/shared/lib/use-desktop-platform';
import { cn } from '@/renderer/shared/lib/utils';
import { TooltipProvider } from '@/renderer/shared/ui/tooltip';

export default function AppShell() {
  const transcriptRef = useRef<HTMLDivElement | null>(null);
  const { composerRef, focusComposer } = useComposerFocus();
  const [isSidebarDrawerOpen, setSidebarDrawerOpen] = useState(false);
  const { isMac } = useDesktopPlatform();
  const commands = useAppCommands();
  const {
    activeConversation,
    commandConversations,
    conversationSummaries,
    draft,
    isStreaming,
    selectedConversationId,
  } = useChatSession();
  const {
    isCommandOpen,
    isContextPanelOpen,
    route,
  } = useShellState();
  const {
    settingsRoute,
    themePreference,
  } = useSettingsState();
  const showContextPanel = route === 'chat' && isContextPanelOpen;
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

  useEffect(() => {
    if (!isCompactShell) {
      setSidebarDrawerOpen(false);
    }
  }, [isCompactShell]);

  useTranscriptScroll({
    conversation: activeConversation,
    route,
    transcriptRef,
  });

  const handleSubmit = useConversationSubmit({ focusComposer });

  const handleCreateConversation = useEffectEvent(() => {
    commands.startConversation();
    setSidebarDrawerOpen(false);
    focusComposer();
  });

  const handleOpenSettings = useEffectEvent(() => {
    startTransition(() => {
      setSidebarDrawerOpen(false);
      commands.openSettings();
    });
  });

  const handleOpenCommand = useEffectEvent(() => {
    commands.setCommandOpen(true);
  });

  const handleCloseCommand = useEffectEvent(() => {
    commands.setCommandOpen(false);
  });

  const handleSelectConversation = useEffectEvent((conversationId: string) => {
    setSidebarDrawerOpen(false);
    commands.openConversation(conversationId);
  });

  useGlobalShortcuts({
    isCommandOpen,
    isMac,
    onCloseCommand: handleCloseCommand,
    onCloseContextPanel: () => commands.toggleInspector(false),
    onCreateConversation: handleCreateConversation,
    onCycleConversation: commands.cycleConversation,
    onOpenCommand: handleOpenCommand,
    onOpenSettings: handleOpenSettings,
    onToggleContextPanel: () => commands.toggleInspector(),
    route,
    usesOverlayContext,
  });

  useEffect(() => {
    if (route === 'chat') {
      focusComposer();
    }
  }, [focusComposer, route]);

  if (!activeConversation) {
    return null;
  }

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
              <AppSidebar
                className="h-full border-r border-app-border"
                conversations={conversationSummaries}
                isCommandOpen={isCommandOpen}
                onCreateConversation={handleCreateConversation}
                onOpenCommand={handleOpenCommand}
                onOpenSettings={handleOpenSettings}
                onSelectConversation={handleSelectConversation}
                route={route}
                selectedConversationId={selectedConversationId}
              />
              <div
                {...resizeHandleProps}
                className="sidebar-resize-handle"
                data-resizing={isSidebarResizing}
              />
            </div>
          ) : null}

          <main className="panel-reveal flex min-h-0 min-w-0 flex-col overflow-hidden">
            {route === 'chat' ? (
              <ChatWorkspace
                composerRef={composerRef}
                conversation={activeConversation}
                draft={draft}
                isCompactShell={isCompactShell}
                isContextPanelOpen={isContextPanelOpen}
                isSidebarOpen={isSidebarDrawerOpen}
                isStreaming={isStreaming}
                onDraftChange={commands.setDraft}
                onSubmit={handleSubmit}
                onToggleInspector={() => commands.toggleInspector()}
                onToggleSidebar={() => setSidebarDrawerOpen((open) => !open)}
                transcriptRef={transcriptRef}
              />
            ) : (
              <SettingsWorkspace
                isCompactShell={isCompactShell}
                isSidebarOpen={isSidebarDrawerOpen}
                onSelectRoute={commands.setSettingsRoute}
                onThemeChange={commands.setThemePreference}
                onToggleSidebar={() => setSidebarDrawerOpen((open) => !open)}
                settingsRoute={settingsRoute}
                themePreference={themePreference}
              />
            )}
          </main>

          <ContextPanelHost
            conversation={activeConversation}
            mode={
              route !== 'chat'
                ? 'hidden'
                : usesInlineContext
                  ? 'inline'
                  : usesOverlayContext
                    ? 'overlay'
                    : 'hidden'
            }
            onClose={() => commands.toggleInspector(false)}
          />
        </div>

        <SidebarDrawer
          isOpen={isCompactShell && isSidebarDrawerOpen}
          onOpenChange={setSidebarDrawerOpen}
          sidebar={(
            <AppSidebar
              className="h-full rounded-[24px]"
              conversations={conversationSummaries}
              isCommandOpen={isCommandOpen}
              onCreateConversation={handleCreateConversation}
              onOpenCommand={handleOpenCommand}
              onOpenSettings={handleOpenSettings}
              onSelectConversation={handleSelectConversation}
              route={route}
              selectedConversationId={selectedConversationId}
            />
          )}
        />

        <CommandMenu
          conversations={commandConversations}
          isContextPanelOpen={isContextPanelOpen}
          onCreateConversation={handleCreateConversation}
          onOpenChange={commands.setCommandOpen}
          onOpenSettings={handleOpenSettings}
          onSelectConversation={handleSelectConversation}
          onToggleContextPanel={() => commands.toggleInspector()}
          open={isCommandOpen}
        />
      </div>
    </TooltipProvider>
  );
}
