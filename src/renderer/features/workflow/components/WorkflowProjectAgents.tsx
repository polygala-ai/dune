import { ArrowUpRight, Bot } from 'lucide-react';

import { Button } from '@/renderer/shared/ui/button';

interface WorkflowProjectAgentsProps {
  agents: Array<{
    currentItemId: string | null;
    currentItemTitle: string | null;
    id: string;
    name: string;
    statusLabel: string;
    updatedLabel: string;
  }>;
  onOpenAgent: (agentId: string) => void;
  onOpenItem: (itemId: string) => void;
}

export function WorkflowProjectAgents({
  agents,
  onOpenAgent,
  onOpenItem,
}: WorkflowProjectAgentsProps) {
  return (
    <section className="rounded-[28px] border border-app-border bg-app-panel/70 p-5">
      <div className="flex items-end justify-between gap-4 border-b border-app-border pb-4">
        <div>
          <div className="surface-eyebrow">Agents</div>
          <h3 className="mt-2 text-[1.3rem] font-semibold tracking-[-0.04em] text-app-text">
            Project agents
          </h3>
          <p className="mt-2 text-sm leading-6 text-app-muted">
            Agents belong to the project, and each can pick up one primary work item at a time.
          </p>
        </div>
      </div>

      <div className="mt-4 space-y-2">
        {agents.length === 0 ? (
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
                    <div className="truncate text-sm font-medium text-app-text">{agent.name}</div>
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
