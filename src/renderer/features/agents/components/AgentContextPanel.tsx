import { PanelRight, X } from 'lucide-react';

import type { PresentedAgent } from '@/renderer/features/agents/types';
import { cn } from '@/renderer/shared/lib/utils';
import { Button } from '@/renderer/shared/ui/button';
import { ScrollArea } from '@/renderer/shared/ui/scroll-area';
import { Separator } from '@/renderer/shared/ui/separator';

interface AgentContextPanelProps {
  agent: PresentedAgent;
  className?: string;
  onClose: () => void;
}

export function AgentContextPanel({
  agent,
  className,
  onClose,
}: AgentContextPanelProps) {
  return (
    <aside
      className={cn(
        'panel-reveal flex min-h-0 flex-col bg-app-panel px-5 py-5',
        className,
      )}
      data-testid="context-panel"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-app-muted">
            <PanelRight className="h-3.5 w-3.5" />
            Inspector
          </div>
          <h3 className="mt-2 text-sm font-medium text-app-text">
            {agent.workspace}
          </h3>
          <p className="mt-1 text-[11px] uppercase tracking-[0.18em] text-app-muted">
            {agent.updatedLabel}
          </p>
        </div>

        <Button
          aria-label="Close context panel"
          onClick={onClose}
          size="icon"
          variant="quiet"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <Separator className="my-4" />

      <ScrollArea className="min-h-0 flex-1 pr-2" contentWidth="fill">
        <div className="pr-2">
          <section>
            <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-app-muted">
              Agent brief
            </div>
            <p className="mt-2 text-sm leading-6 text-app-muted">
              {agent.note}
            </p>
          </section>

          {agent.contextCards.slice(0, 2).map((card) => (
            <section className="border-t border-app-border pt-4" key={card.id}>
              <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-app-muted">
                {card.eyebrow}
              </div>
              <h4 className="mt-2 text-sm font-medium text-app-text">
                {card.title}
              </h4>
              <p className="mt-2 text-sm leading-6 text-app-muted">{card.body}</p>
            </section>
          ))}
        </div>
      </ScrollArea>
    </aside>
  );
}

