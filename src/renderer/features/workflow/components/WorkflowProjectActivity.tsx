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
        {summary.hasOlderEntries ? (
          <div className="flex justify-center">
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

        {summary.rollingSummary ? (
          <article className="overflow-hidden rounded-[20px] border border-app-border bg-app-card/60 px-4 py-4">
            <div className="flex flex-wrap items-center gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-app-muted">
              <span>Archived Summary</span>
              <span className="h-1 w-1 rounded-full bg-app-border-strong" />
              <span>{summary.archivedEntryCount} archived</span>
              <span className="h-1 w-1 rounded-full bg-app-border-strong" />
              <span>{summary.totalEntryCount} total</span>
            </div>
            <pre className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-app-text">
              {summary.rollingSummary}
            </pre>
          </article>
        ) : null}

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
      </div>
    </section>
  );
}
