interface WorkflowProjectActivityProps {
  entries: Array<{
    createdAtLabel: string;
    description: string;
    id: string;
    itemId: string;
    itemTitle: string;
  }>;
  onOpenItem: (itemId: string) => void;
}

export function WorkflowProjectActivity({
  entries,
  onOpenItem,
}: WorkflowProjectActivityProps) {
  return (
    <section className="rounded-[28px] border border-app-border bg-app-panel/70 p-5">
      <div className="border-b border-app-border pb-4">
        <div className="surface-eyebrow">Activity</div>
        <h3 className="mt-2 text-[1.3rem] font-semibold tracking-[-0.04em] text-app-text">
          Project timeline
        </h3>
        <p className="mt-2 text-sm leading-6 text-app-muted">
          A calm project-level timeline of item changes, assignment moves, and new outputs.
        </p>
      </div>

      <div className="mt-4 space-y-2">
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
                <p className="mt-3 text-sm leading-6 text-app-text">{entry.description}</p>
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
