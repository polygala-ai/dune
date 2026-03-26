import type { RefObject } from 'react';

import { CompactShellToolbar } from '@/renderer/app/shell/CompactShellToolbar';
import { AgentPanel } from '@/renderer/features/agents/components/AgentPanel';
import { EmptyAgentState } from '@/renderer/features/agents/components/EmptyAgentState';

import type {
  PresentedAgent,
  AgentRuntimeInfo,
} from '@/renderer/features/agents/types';

interface AgentWorkspaceProps {
  agent: PresentedAgent | null;
  composerRef: RefObject<HTMLTextAreaElement | null>;
  draft: string;
  isCompactShell: boolean;
  isContextPanelOpen: boolean;
  isSidebarOpen: boolean;
  isStreaming: boolean;
  onCreateAgent: () => void;
  onDraftChange: (value: string) => void;
  onSubmit: (value: string) => Promise<void>;
  onToggleInspector: () => void;
  onToggleSidebar: () => void;
  runtimeInfo: AgentRuntimeInfo;
  transcriptRef: RefObject<HTMLDivElement | null>;
}

export function AgentWorkspace({
  agent,
  composerRef,
  draft,
  isCompactShell,
  isContextPanelOpen,
  isSidebarOpen,
  isStreaming,
  onCreateAgent,
  onDraftChange,
  onSubmit,
  onToggleInspector,
  onToggleSidebar,
  runtimeInfo,
  transcriptRef,
}: AgentWorkspaceProps) {
  return (
    <>
      {isCompactShell ? (
        <CompactShellToolbar
          isSidebarOpen={isSidebarOpen}
          onToggleSidebar={onToggleSidebar}
          {...(agent
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
            isStreaming={isStreaming}
            onDraftChange={onDraftChange}
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
