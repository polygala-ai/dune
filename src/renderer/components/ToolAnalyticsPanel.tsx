// Tool analytics panel UI.

import {
  useCallback,
  useEffect,
  useState,
} from 'react';
import {
  AlertTriangle,
  BarChart3,
  RefreshCw,
} from 'lucide-react';

import { cn } from '@/renderer/shared/lib/utils';
import { Button } from '@/renderer/shared/ui/button';
import type {
  ToolUsageSummaryResult,
  ToolUsageSummaryRow,
} from '@/shared/agents/tool-analytics';

/** Formats a percent value. */
function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

/** Formats a duration value. */
function formatDuration(value: number) {
  return `${Math.round(value)} ms`;
}

/** Returns error rate for a row. */
function getErrorRate(row: ToolUsageSummaryRow) {
  return Math.max(0, 1 - row.successRate);
}

/** Renders AgentLite tool usage analytics. */
export function ToolAnalyticsPanel() {
  const [summary, setSummary] = useState<ToolUsageSummaryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setLoading] = useState(false);

  const loadSummary = useCallback(async () => {
    const bridge = window.duneDesktop;

    if (!bridge?.getToolUsageSummary) {
      setError('Tool analytics are unavailable in this runtime.');
      setSummary(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      setSummary(await bridge.getToolUsageSummary());
    } catch (loadError) {
      setError(`Failed to load tool analytics. ${String(loadError)}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  const rows = summary?.rows ?? [];
  const totalCalls = rows.reduce((sum, row) => sum + row.callCount, 0);
  const totalErrors = rows.reduce(
    (sum, row) => sum + row.callCount - row.successCount,
    0,
  );
  const averageErrorRate = totalCalls > 0 ? totalErrors / totalCalls : 0;
  const maxCallCount = Math.max(...rows.map((row) => row.callCount), 1);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-6 pb-6 pt-5">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-app-border pb-5">
        <div>
          <div className="surface-eyebrow">Runtime</div>
          <h2 className="surface-title">Tool Analytics</h2>
          <p className="surface-description">
            Top AgentLite tools by calls and error rate for the last hour.
          </p>
        </div>
        <Button
          disabled={isLoading}
          onClick={() => {
            void loadSummary();
          }}
          type="button"
          variant="outline"
        >
          <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
          Refresh
        </Button>
      </div>

      <div className="grid gap-3 py-5 sm:grid-cols-3">
        <section className="rounded-[20px] border border-app-border bg-app-panel/70 p-4">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-app-muted">
            Calls
          </p>
          <p className="mt-2 text-2xl font-semibold text-app-text">{totalCalls}</p>
        </section>
        <section className="rounded-[20px] border border-app-border bg-app-panel/70 p-4">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-app-muted">
            Tools
          </p>
          <p className="mt-2 text-2xl font-semibold text-app-text">{rows.length}</p>
        </section>
        <section className="rounded-[20px] border border-app-border bg-app-panel/70 p-4">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-app-muted">
            Error rate
          </p>
          <p className="mt-2 text-2xl font-semibold text-app-text">
            {formatPercent(averageErrorRate)}
          </p>
        </section>
      </div>

      {error ? (
        <div className="mb-4 flex items-start gap-3 rounded-[20px] border border-app-border bg-app-card/70 px-4 py-3 text-sm text-app-text">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-app-danger" />
          <span>{error}</span>
        </div>
      ) : null}

      <section className="min-h-0 flex-1 overflow-hidden rounded-[28px] border border-app-border bg-app-panel/70">
        {rows.length === 0 && !isLoading ? (
          <div className="flex h-full min-h-[260px] items-center justify-center px-8 text-center">
            <div>
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-app-card text-app-muted">
                <BarChart3 className="h-5 w-5" />
              </div>
              <h3 className="mt-5 text-[1.3rem] font-semibold text-app-text">
                No tool calls yet
              </h3>
              <p className="mt-3 max-w-[420px] text-sm leading-6 text-app-muted">
                Tool usage appears here after AgentLite records tool calls.
              </p>
            </div>
          </div>
        ) : (
          <div className="thin-scrollbar grid h-full gap-0 overflow-auto lg:grid-cols-[minmax(0,1fr)_minmax(420px,0.85fr)]">
            <div className="border-b border-app-border p-5 lg:border-b-0 lg:border-r">
              <h3 className="text-sm font-semibold text-app-text">Top tools by usage</h3>
              <div className="mt-4 space-y-4">
                {rows.map((row) => (
                  <div key={row.toolName}>
                    <div className="mb-2 flex items-center justify-between gap-4 text-sm">
                      <span className="truncate font-medium text-app-text">{row.toolName}</span>
                      <span className="shrink-0 text-app-muted">{row.callCount}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-app-card">
                      <div
                        className="h-full rounded-full bg-app-accent"
                        style={{
                          width: `${Math.max(4, (row.callCount / maxCallCount) * 100)}%`,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="min-w-0 p-5">
              <h3 className="text-sm font-semibold text-app-text">Error rate per tool</h3>
              <div className="mt-4 overflow-hidden rounded-[14px] border border-app-border">
                <table className="w-full min-w-[400px] border-collapse text-left text-sm">
                  <thead className="bg-app-card/70 text-xs uppercase tracking-[0.16em] text-app-muted">
                    <tr className="border-b border-app-border">
                      <th className="px-4 py-3 font-semibold">Tool</th>
                      <th className="px-4 py-3 text-right font-semibold">Errors</th>
                      <th className="px-4 py-3 text-right font-semibold">Rate</th>
                      <th className="px-4 py-3 text-right font-semibold">Avg time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => {
                      const errorRate = getErrorRate(row);
                      const errorCount = row.callCount - row.successCount;

                      return (
                        <tr
                          className="border-b border-app-border/70 transition-colors last:border-0 hover:bg-app-card/60"
                          key={row.toolName}
                        >
                          <td className="max-w-[160px] truncate px-4 py-4 font-medium text-app-text">
                            {row.toolName}
                          </td>
                          <td className="px-4 py-4 text-right text-app-text">{errorCount}</td>
                          <td className="px-4 py-4 text-right">
                            <span
                              className={cn(
                                'rounded-full px-2.5 py-1 text-xs font-semibold',
                                errorRate > 0.2
                                  ? 'bg-app-danger/10 text-app-danger'
                                  : 'bg-app-accent-soft text-app-text',
                              )}
                            >
                              {formatPercent(errorRate)}
                            </span>
                          </td>
                          <td className="px-4 py-4 text-right text-app-muted">
                            {formatDuration(row.avgDurationMs)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
