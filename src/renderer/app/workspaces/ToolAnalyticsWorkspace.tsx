// Tool analytics workspace UI.

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, BarChart3, RefreshCw } from "lucide-react";

import { CompactShellToolbar } from "@/renderer/app/shell/CompactShellToolbar";
import { cn } from "@/renderer/shared/lib/utils";
import { Button } from "@/renderer/shared/ui/button";
import type {
  ToolUsageSummaryResult,
  ToolUsageSummaryRow,
} from "@/shared/agents/tool-analytics";

/** Tool analytics workspace props. */
interface ToolAnalyticsWorkspaceProps {
  isCompactShell: boolean;
  isSidebarOpen: boolean;
  onToggleSidebar: () => void;
  showCompactSidebarToggle: boolean;
}

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

/** Renders the tool analytics workspace UI. */
export function ToolAnalyticsWorkspace({
  isCompactShell,
  isSidebarOpen,
  onToggleSidebar,
  showCompactSidebarToggle,
}: ToolAnalyticsWorkspaceProps) {
  const [summary, setSummary] = useState<ToolUsageSummaryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setLoading] = useState(false);

  const loadSummary = useCallback(async () => {
    const bridge = window.duneDesktop;

    if (!bridge?.getToolUsageSummary) {
      setError("Tool analytics are unavailable in this runtime.");
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

  return (
    <>
      {isCompactShell ? (
        <CompactShellToolbar
          isSidebarOpen={isSidebarOpen}
          onToggleSidebar={onToggleSidebar}
          showSidebarToggle={showCompactSidebarToggle}
        />
      ) : null}

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
            <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
            Refresh
          </Button>
        </div>

        <div className="grid gap-3 py-5 sm:grid-cols-3">
          <section className="rounded-[20px] border border-app-border bg-app-panel/70 p-4">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-app-muted">
              Calls
            </p>
            <p className="mt-2 text-2xl font-semibold text-app-text">
              {totalCalls}
            </p>
          </section>
          <section className="rounded-[20px] border border-app-border bg-app-panel/70 p-4">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-app-muted">
              Tools
            </p>
            <p className="mt-2 text-2xl font-semibold text-app-text">
              {rows.length}
            </p>
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
            <div className="thin-scrollbar h-full overflow-auto">
              <table className="w-full min-w-[640px] border-collapse text-left text-sm">
                <thead className="sticky top-0 bg-app-panel text-xs uppercase tracking-[0.16em] text-app-muted">
                  <tr className="border-b border-app-border">
                    <th className="px-5 py-3 font-semibold">Tool</th>
                    <th className="px-5 py-3 text-right font-semibold">
                      Calls
                    </th>
                    <th className="px-5 py-3 text-right font-semibold">
                      Errors
                    </th>
                    <th className="px-5 py-3 text-right font-semibold">
                      Error rate
                    </th>
                    <th className="px-5 py-3 text-right font-semibold">
                      Avg time
                    </th>
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
                        <td className="px-5 py-4 font-medium text-app-text">
                          {row.toolName}
                        </td>
                        <td className="px-5 py-4 text-right text-app-text">
                          {row.callCount}
                        </td>
                        <td className="px-5 py-4 text-right text-app-text">
                          {errorCount}
                        </td>
                        <td className="px-5 py-4 text-right">
                          <span
                            className={cn(
                              "rounded-full px-2.5 py-1 text-xs font-semibold",
                              errorRate > 0.2
                                ? "bg-app-danger/10 text-app-danger"
                                : "bg-app-accent-soft text-app-text",
                            )}
                          >
                            {formatPercent(errorRate)}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-right text-app-muted">
                          {formatDuration(row.avgDurationMs)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
