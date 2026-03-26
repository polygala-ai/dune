import { Bot, Plus } from 'lucide-react';

import type { AgentRuntimeInfo } from '@/renderer/features/agents/types';
import { Button } from '@/renderer/shared/ui/button';

interface EmptyAgentStateProps {
  onCreateAgent: () => void;
  runtimeInfo: AgentRuntimeInfo;
}

export function EmptyAgentState({
  onCreateAgent,
  runtimeInfo,
}: EmptyAgentStateProps) {
  const runtimeLabel = runtimeInfo.mode === 'real' ? 'Real AgentLite' : 'Mock fallback';

  return (
    <div className="flex h-full min-h-0 min-w-0 items-center justify-center px-8 py-10">
      <div className="w-full max-w-2xl rounded-[28px] border border-app-border bg-app-card/70 p-8 shadow-[var(--app-shadow)]">
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-app-muted">
          <Bot className="h-4 w-4" />
          Agent shell
        </div>

        <h2 className="mt-5 text-[2rem] font-semibold tracking-[-0.05em] text-app-text">
          No agents yet.
        </h2>
        <p className="mt-3 max-w-xl text-sm leading-7 text-app-muted">
          Start by naming one agent and attaching it to Dune chat. Dune now resolves
          its runtime through Electron main, so this shell can run on real AgentLite
          or drop back to the mock provider when the runtime is unavailable.
        </p>

        <div className="mt-4 rounded-[18px] border border-app-border bg-app-panel/70 px-4 py-3">
          <div className="flex items-center justify-between gap-4 text-sm">
            <span className="text-app-muted">Runtime</span>
            <span className="font-medium text-app-text">{runtimeLabel}</span>
          </div>
          <p className="mt-2 text-[12px] leading-5 text-app-muted">
            {runtimeInfo.message}
          </p>
        </div>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Button onClick={onCreateAgent} size="lg">
            New agent
            <Plus className="h-4 w-4" />
          </Button>
          <p className="text-[12px] leading-5 text-app-muted">
            Create one durable workspace with a built-in channel instead of restarting
            from scratch each time.
          </p>
        </div>
      </div>
    </div>
  );
}
