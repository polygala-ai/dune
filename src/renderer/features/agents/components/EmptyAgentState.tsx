import { Bot, Plus } from 'lucide-react';

import { Button } from '@/renderer/shared/ui/button';

interface EmptyAgentStateProps {
  onCreateAgent: () => void;
}

export function EmptyAgentState({ onCreateAgent }: EmptyAgentStateProps) {
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
          Start by naming one agent. The prototype keeps each workspace local while
          the app is open, but the shell already matches the AgentLite model that will
          replace the mock runtime next.
        </p>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Button onClick={onCreateAgent} size="lg">
            New agent
            <Plus className="h-4 w-4" />
          </Button>
          <p className="text-[12px] leading-5 text-app-muted">
            Create one durable workspace instead of restarting from scratch each time.
          </p>
        </div>
      </div>
    </div>
  );
}
