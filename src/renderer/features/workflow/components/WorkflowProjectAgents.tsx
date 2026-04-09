import { ArrowUpRight, Bot } from 'lucide-react';

import type { AgentRuntimeInfo } from '@/renderer/features/agents/types';
import { Button } from '@/renderer/shared/ui/button';

interface WorkflowProjectAgentsProps {
  agents: Array<{
    currentItemId: string | null;
    currentItemTitle: string | null;
    id: string;
    isProjectMain: boolean;
    name: string;
    statusLabel: string;
    updatedLabel: string;
  }>;
  onOpenAgent: (agentId: string) => void;
  onOpenItem: (itemId: string) => void;
  runtimeInfo: AgentRuntimeInfo;
}

export function WorkflowProjectAgents({
  agents,
  onOpenAgent,
  onOpenItem,
  runtimeInfo,
}: WorkflowProjectAgentsProps) {
  const isInitializing = runtimeInfo.status === 'starting' && agents.length === 0;
  const runtimeMessage = runtimeInfo.message ?? 'Starting Dune runtime.';

  return (
    <section className="rounded-[28px] border border-app-border bg-app-panel/70 p-5">
      <div className="space-y-2">
        {isInitializing ? (
          <div
            aria-busy="true"
            className="rounded-[20px] border border-app-border bg-app-card/60 px-5 py-6"
          >
            <div className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className="streaming-dot h-2.5 w-2.5 rounded-full bg-app-accent"
              />
              <div className="surface-eyebrow">Initializing agents</div>
            </div>
            <h2 className="surface-title">Preparing the agent runtime</h2>
            <p className="surface-description">
              Dune is connecting to AgentLite and loading this project's agents. This usually
              takes a few seconds.
            </p>
            <div className="mt-5 rounded-[18px] border border-app-border bg-app-panel/70 px-4 py-3 text-sm text-app-text">
              {runtimeMessage}
            </div>
            <p className="mt-3 text-sm leading-6 text-app-muted">
              Agent controls will appear here as soon as initialization finishes.
            </p>
          </div>
        ) : agents.length === 0 ? (
          <div className="rounded-[20px] border border-dashed border-app-border bg-app-card/60 px-5 py-6 text-sm leading-6 text-app-muted">
            No agents yet. Create the first project agent when a work item is ready for execution.
          </div>
        ) : (
          agents.map((agent) => (
            <div
              className="flex flex-wrap items-center justify-between gap-4 rounded-[20px] border border-app-border bg-app-card/60 px-4 py-4"
              key={agent.id}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-3">
                  <Bot className="h-4 w-4 text-app-muted" />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="truncate text-sm font-medium text-app-text">{agent.name}</div>
                      {agent.isProjectMain ? (
                        <span className="pill-key border-transparent bg-app-accent-soft text-app-accent-ink">
                          Main
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-1 text-xs leading-5 text-app-muted">
                      {agent.statusLabel} · Updated {agent.updatedLabel}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex min-w-0 flex-wrap items-center gap-2">
                {agent.currentItemId && agent.currentItemTitle ? (
                  <button
                    className="rounded-[14px] border border-app-border bg-app-panel px-3 py-2 text-sm text-app-text transition-colors hover:bg-app-card"
                    onClick={() => onOpenItem(agent.currentItemId!)}
                    type="button"
                  >
                    {agent.currentItemTitle}
                  </button>
                ) : (
                  <span className="text-sm text-app-muted">No current work item</span>
                )}

                <Button
                  onClick={() => onOpenAgent(agent.id)}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  <ArrowUpRight className="h-4 w-4" />
                  Open agent
                </Button>
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
