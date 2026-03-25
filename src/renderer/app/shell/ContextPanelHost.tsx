import { AgentContextPanel } from '@/renderer/features/agents/components/AgentContextPanel';

import type { PresentedAgent } from '@/renderer/features/agents/types';

interface ContextPanelHostProps {
  agent: PresentedAgent | null;
  mode: 'hidden' | 'inline' | 'overlay';
  onClose: () => void;
}

export function ContextPanelHost({
  agent,
  mode,
  onClose,
}: ContextPanelHostProps) {
  if (mode === 'hidden' || !agent) {
    return null;
  }

  if (mode === 'inline') {
    return (
      <AgentContextPanel
        agent={agent}
        className="h-full border-l border-app-border"
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
        <AgentContextPanel
          agent={agent}
          className="app-no-drag h-full border-l border-app-border"
          onClose={onClose}
        />
      </div>
    </>
  );
}
