import { ConversationContextPanel } from '@/renderer/features/chat/components/ConversationContextPanel';

import type { PresentedConversation } from '@/renderer/features/chat/types';

interface ContextPanelHostProps {
  conversation: PresentedConversation;
  mode: 'hidden' | 'inline' | 'overlay';
  onClose: () => void;
}

export function ContextPanelHost({
  conversation,
  mode,
  onClose,
}: ContextPanelHostProps) {
  if (mode === 'hidden') {
    return null;
  }

  if (mode === 'inline') {
    return (
      <ConversationContextPanel
        className="h-full border-l border-app-border"
        conversation={conversation}
        onClose={onClose}
      />
    );
  }

  return (
    <>
      <button
        aria-label="Close context panel backdrop"
        className="shell-overlay-backdrop"
        onClick={onClose}
        type="button"
      />
      <div className="shell-overlay-context">
        <ConversationContextPanel
          className="app-no-drag h-full border-l border-app-border"
          conversation={conversation}
          onClose={onClose}
        />
      </div>
    </>
  );
}
