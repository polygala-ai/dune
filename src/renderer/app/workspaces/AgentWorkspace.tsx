// Agent workspace UI.

import type { RefObject } from 'react';

import { CompactShellToolbar } from '@/renderer/app/shell/CompactShellToolbar';
import { AgentPanel } from '@/renderer/features/agents/components/AgentPanel';
import { EmptyAgentState } from '@/renderer/features/agents/components/EmptyAgentState';

import type {
  PresentedAgent,
  AgentRuntimeInfo,
} from '@/renderer/features/agents/types';

/** Agent workspace props. */
interface AgentWorkspaceProps {
  agent: PresentedAgent | null;
  composerRef: RefObject<HTMLTextAreaElement | null>;
  draft: string;
  isCompactShell: boolean;
  isContextPanelOpen: boolean;
  isLoadingOlderMessages: boolean;
  isSidebarOpen: boolean;
  onCreateAgent: () => void;
  onDraftChange: (value: string) => void;
  onLoadOlderMessages: () => Promise<void>;
  onSubmit: (value: string) => Promise<void>;
  onToggleInspector: () => void;
  onToggleSidebar: () => void;
  runtimeInfo: AgentRuntimeInfo;
  showCompactInspectorToggle: boolean;
  showCompactSidebarToggle: boolean;
  transcriptRef: RefObject<HTMLDivElement | null>;
}

/** Renders the agent workspace UI. */
export function AgentWorkspace({
  agent,
  composerRef,
  draft,
  isCompactShell,
  isContextPanelOpen,
  isLoadingOlderMessages,
  isSidebarOpen,
  onCreateAgent,
  onDraftChange,
  onLoadOlderMessages,
  onSubmit,
  onToggleInspector,
  onToggleSidebar,
  runtimeInfo,
  showCompactInspectorToggle,
  showCompactSidebarToggle,
  transcriptRef,
}: AgentWorkspaceProps) {
  return (
    <>
      {isCompactShell ? (
        <CompactShellToolbar
          isSidebarOpen={isSidebarOpen}
          onToggleSidebar={onToggleSidebar}
          showSidebarToggle={showCompactSidebarToggle}
          {...(agent && showCompactInspectorToggle
            ? {
                inspectorToggle: {
                  isOpen: isContextPanelOpen,
                  onToggle: onToggleInspector,
                },
              }
            : {})}
        />
      ) : null}

      <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
        {agent ? (
          <AgentPanel
            agent={agent}
            composerRef={composerRef}
            draft={draft}
            isLoadingOlderMessages={isLoadingOlderMessages}
            onDraftChange={onDraftChange}
            onLoadOlderMessages={onLoadOlderMessages}
            onSubmit={onSubmit}
            transcriptRef={transcriptRef}
          />
        ) : (
          <EmptyAgentState
            onCreateAgent={onCreateAgent}
            runtimeInfo={runtimeInfo}
          />
        )}
      </div>
    </>
  );
}
