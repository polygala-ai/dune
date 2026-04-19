// Workflow project activity UI.

import type { WorkflowProjectActivitySummary } from '@/renderer/features/workflow/types';
import { Button } from '@/renderer/shared/ui/button';

/** Workflow project activity props. */
interface WorkflowProjectActivityProps {
  entries: Array<{
    actor?: string | undefined;
    createdAtLabel: string;
    description: string;
    id: string;
    itemId: string;
    itemTitle: string;
  }>;
  isLoadingOlderEntries: boolean;
  onLoadOlderEntries: () => Promise<void>;
  onOpenItem: (itemId: string) => void;
  summary: WorkflowProjectActivitySummary;
}

/** Renders the workflow project activity UI. */
export function WorkflowProjectActivity({
  entries,
  isLoadingOlderEntries,
  onLoadOlderEntries,
  onOpenItem,
  summary,
}: WorkflowProjectActivityProps) {
  return (
    <section className="rounded-[28px] border border-app-border bg-app-panel/70 p-5">
      <div className="space-y-2">
        {entries.length === 0 ? (
          <div className="rounded-[20px] border border-dashed border-app-border bg-app-card/60 px-5 py-6 text-sm leading-6 text-app-muted">
            Activity will appear here as the project moves forward.
          </div>
        ) : (
          entries.map((entry) => (
            <div
              className="flex flex-wrap items-start justify-between gap-4 rounded-[20px] border border-app-border bg-app-card/60 px-4 py-4"
              key={entry.id}
            >
              <div className="min-w-0 flex-1">
                <button
                  className="rounded-[14px] border border-app-border bg-app-panel px-3 py-1 text-sm text-app-text transition-colors hover:bg-app-card"
                  onClick={() => onOpenItem(entry.itemId)}
                  type="button"
                >
                  {entry.itemTitle}
                </button>
                {entry.actor ? (
                  <p className="mt-2 text-xs font-medium text-app-accent">{entry.actor}</p>
                ) : null}
                <p className={`${entry.actor ? 'mt-1' : 'mt-3'} text-sm leading-6 text-app-text`}>{entry.description}</p>
              </div>
              <span className="pill-key border-transparent bg-app-panel">
                {entry.createdAtLabel}
              </span>
            </div>
          ))
        )}

        {summary.hasOlderEntries ? (
          <div className="flex justify-center pt-2">
            <Button
              disabled={isLoadingOlderEntries}
              onClick={() => {
                void onLoadOlderEntries();
              }}
              size="sm"
              type="button"
              variant="quiet"
            >
              {isLoadingOlderEntries ? 'Loading older activity…' : 'Load older activity'}
            </Button>
          </div>
        ) : null}
      </div>
    </section>
  );
}
