import type { RefObject } from 'react';

import { ChatPanel } from '@/renderer/features/chat/components/ChatPanel';
import { CompactShellToolbar } from '@/renderer/app/shell/CompactShellToolbar';

import type { PresentedConversation } from '@/renderer/features/chat/types';

interface ChatWorkspaceProps {
  composerRef: RefObject<HTMLTextAreaElement | null>;
  conversation: PresentedConversation;
  draft: string;
  isCompactShell: boolean;
  isContextPanelOpen: boolean;
  isSidebarOpen: boolean;
  isStreaming: boolean;
  onDraftChange: (value: string) => void;
  onSubmit: (value: string) => Promise<void>;
  onToggleInspector: () => void;
  onToggleSidebar: () => void;
  transcriptRef: RefObject<HTMLDivElement | null>;
}

export function ChatWorkspace({
  composerRef,
  conversation,
  draft,
  isCompactShell,
  isContextPanelOpen,
  isSidebarOpen,
  isStreaming,
  onDraftChange,
  onSubmit,
  onToggleInspector,
  onToggleSidebar,
  transcriptRef,
}: ChatWorkspaceProps) {
  return (
    <>
      {isCompactShell ? (
        <CompactShellToolbar
          inspectorToggle={{
            isOpen: isContextPanelOpen,
            onToggle: onToggleInspector,
          }}
          isSidebarOpen={isSidebarOpen}
          onToggleSidebar={onToggleSidebar}
        />
      ) : null}

      <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
        <ChatPanel
          composerRef={composerRef}
          conversation={conversation}
          draft={draft}
          isStreaming={isStreaming}
          onDraftChange={onDraftChange}
          onSubmit={onSubmit}
          transcriptRef={transcriptRef}
        />
      </div>
    </>
  );
}
