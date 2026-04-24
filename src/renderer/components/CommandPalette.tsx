// Work item search command palette.

import {
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  Search,
  Sparkles,
} from 'lucide-react';

import {
  createDefaultWorkItemFilters,
  SearchIndex,
  type WorkItemSearchResult,
} from '@/renderer/utils/SearchIndex';
import type { Agent } from '@/renderer/features/agents/types';
import type { WorkflowItem } from '@/renderer/features/workflow/types';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/renderer/shared/ui/dialog';
import { Input } from '@/renderer/shared/ui/input';
import { cn } from '@/renderer/shared/lib/utils';

/** Command palette props. */
interface CommandPaletteProps {
  agents: Agent[];
  items: WorkflowItem[];
  onOpenChange: (open: boolean) => void;
  onSelectItem: (itemId: string, projectId: string) => void;
  open: boolean;
}

function ResultRow({
  active,
  result,
  onSelect,
}: {
  active: boolean;
  result: WorkItemSearchResult;
  onSelect: () => void;
}) {
  return (
    <button
      className={cn(
        'grid w-full grid-cols-[minmax(0,1fr)_auto] gap-3 rounded-[16px] px-4 py-3 text-left transition-colors',
        active ? 'bg-app-accent-soft text-app-text' : 'hover:bg-app-card',
      )}
      onClick={onSelect}
      type="button"
    >
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold text-app-text">
          {result.title}
        </span>
        <span className="mt-1 block line-clamp-2 text-xs leading-5 text-app-muted">
          {result.snippet}
        </span>
      </span>
      <span className="flex min-w-[132px] flex-col items-end gap-1 text-right">
        <span className="pill-key bg-app-card text-[11px]">
          {result.statusLabel}
        </span>
        <span className="max-w-[160px] truncate text-[11px] text-app-muted">
          {result.assignee}
        </span>
      </span>
    </button>
  );
}

/** Renders a global work item search palette. */
export function CommandPalette({
  agents,
  items,
  onOpenChange,
  onSelectItem,
  open,
}: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const index = useMemo(() => new SearchIndex(items, agents), [agents, items]);
  const results = useMemo(
    () => index.search(query, createDefaultWorkItemFilters()).slice(0, 12),
    [index, query],
  );

  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIndex(0);
    }
  }, [open]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  const selectResult = (result: WorkItemSearchResult | undefined) => {
    if (!result) {
      return;
    }

    onOpenChange(false);
    onSelectItem(result.id, result.projectId);
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent
        className="overflow-hidden border-app-border bg-app-panel-strong p-0"
        overlayClassName="bg-black/55 backdrop-blur-[2px]"
      >
        <DialogTitle className="sr-only">Search work items</DialogTitle>
        <DialogDescription className="sr-only">
          Search work item titles, briefs, and work product content.
        </DialogDescription>

        <div
          className="flex h-full w-full flex-col overflow-hidden rounded-[22px] bg-app-panel-strong text-app-text"
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              setActiveIndex((current) => Math.min(current + 1, results.length - 1));
              return;
            }

            if (event.key === 'ArrowUp') {
              event.preventDefault();
              setActiveIndex((current) => Math.max(current - 1, 0));
              return;
            }

            if (event.key === 'Enter') {
              event.preventDefault();
              selectResult(results[activeIndex]);
            }
          }}
        >
          <div className="flex h-14 items-center gap-3 border-b border-app-border px-4">
            <Search className="h-4 w-4 shrink-0 text-app-muted" />
            <Input
              autoFocus
              className="h-12 border-0 bg-transparent px-0 focus-visible:ring-0"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search titles, briefs, and work products…"
              value={query}
            />
          </div>

          <div className="thin-scrollbar max-h-[440px] overflow-y-auto p-2">
            {results.length > 0 ? (
              <div className="flex flex-col gap-1">
                {results.map((result, index) => (
                  <ResultRow
                    active={index === activeIndex}
                    key={result.id}
                    onSelect={() => selectResult(result)}
                    result={result}
                  />
                ))}
              </div>
            ) : (
              <div className="flex min-h-[180px] flex-col items-center justify-center px-6 text-center">
                <Sparkles className="h-5 w-5 text-app-muted" />
                <p className="mt-3 text-sm font-medium text-app-text">
                  No matching work items
                </p>
                <p className="mt-1 text-xs leading-5 text-app-muted">
                  Try a title, brief detail, or text from a work product.
                </p>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
