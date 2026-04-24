// Token usage dashboard settings section.

import { useCallback, useEffect, useState } from 'react';

import type { UsageByModel, UsageBySession, UsageSummaryResult } from '@/shared/electron/desktop-bridge';
import type { SettingsSectionComponentProps } from '@/renderer/features/settings/config/settings-sections';
import { cn } from '@/renderer/shared/lib/utils';

import { SettingsSectionIntro } from './SettingsSectionIntro';

/** Time range options. */
type TimeRange = 'all' | '7d';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

/** Formats a USD cost value. */
function formatCost(value: number | null | undefined): string {
  if (value == null) return '--';
  if (value < 0.01) return '<$0.01';
  return `$${value.toFixed(2)}`;
}

/** Formats a token count. */
function formatTokens(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(value);
}

/** Props for the stat card. */
interface StatCardProps {
  label: string;
  value: string;
}

/** Renders a single summary stat card. */
function StatCard({ label, value }: StatCardProps) {
  return (
    <div className="rounded-[20px] border border-app-border bg-app-card/60 p-5 flex flex-col gap-1">
      <span className="text-xs text-app-muted uppercase tracking-wider">{label}</span>
      <span className="text-xl font-semibold tabular-nums">{value}</span>
    </div>
  );
}

/** Props for a bar row. */
interface BarRowProps {
  label: string;
  value: string;
  pct: number;
  dimmed: boolean;
}

/** Renders a single horizontal bar row. */
function BarRow({ label, value, pct, dimmed }: BarRowProps) {
  return (
    <div className="flex items-center gap-3">
      <span
        className={cn(
          'w-44 truncate text-sm',
          dimmed ? 'text-app-muted' : 'text-app-foreground',
        )}
        title={label}
      >
        {label}
      </span>
      <div className="flex-1 h-2 rounded-full bg-app-border overflow-hidden">
        <div
          className={cn(
            'h-full rounded-full transition-all',
            dimmed ? 'bg-app-accent/30' : 'bg-app-accent',
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className={cn('w-16 text-right text-sm tabular-nums', dimmed ? 'text-app-muted' : '')}>
        {value}
      </span>
    </div>
  );
}

/** Skeleton bar for loading state. */
function SkeletonBar() {
  return (
    <div className="flex items-center gap-3 animate-pulse">
      <div className="w-44 h-4 rounded bg-app-border" />
      <div className="flex-1 h-2 rounded-full bg-app-border" />
      <div className="w-16 h-4 rounded bg-app-border" />
    </div>
  );
}

/** Renders the usage settings UI. */
export function UsageSettings(_props: SettingsSectionComponentProps) {
  const [range, setRange] = useState<TimeRange>('all');
  const [data, setData] = useState<UsageSummaryResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);

  const fetchUsage = useCallback(async (timeRange: TimeRange) => {
    setLoading(true);
    try {
      const since = timeRange === '7d' ? Date.now() - SEVEN_DAYS_MS : undefined;
      const result = await window.duneDesktop?.getUsageSummary?.({ since }) ?? null;
      if (result === null) {
        setUnavailable(true);
        setData(null);
      } else {
        setUnavailable(false);
        setData(result);
      }
    } catch {
      setUnavailable(true);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchUsage(range);
  }, [fetchUsage, range]);

  const handleRangeChange = (newRange: TimeRange) => {
    setRange(newRange);
  };

  const topBySession = (data?.by_session ?? [])
    .slice()
    .sort((a, b) => (b.cost_usd ?? 0) - (a.cost_usd ?? 0))
    .slice(0, 10);

  const topByModel = (data?.by_model ?? [])
    .slice()
    .sort((a, b) => (b.cost_usd ?? 0) - (a.cost_usd ?? 0))
    .slice(0, 10);

  const maxSessionCost = topBySession[0]?.cost_usd ?? 0;
  const maxModelCost = topByModel[0]?.cost_usd ?? 0;

  const getSessionPct = (row: UsageBySession) =>
    maxSessionCost > 0 ? Math.round(((row.cost_usd ?? 0) / maxSessionCost) * 100) : 0;

  const getModelPct = (row: UsageByModel) =>
    maxModelCost > 0 ? Math.round(((row.cost_usd ?? 0) / maxModelCost) * 100) : 0;

  return (
    <>
      <SettingsSectionIntro
        eyebrow="Usage"
        title="Token consumption"
        description="Token usage and cost across all agents in this project."
      />

      {/* Time range toggle */}
      <div className="mt-6 flex gap-2">
        {(['all', '7d'] as TimeRange[]).map((r) => (
          <button
            key={r}
            onClick={() => handleRangeChange(r)}
            className={cn(
              'px-3 py-1.5 rounded-lg text-sm transition-colors',
              range === r
                ? 'bg-app-accent text-white'
                : 'bg-app-card/60 border border-app-border text-app-muted hover:text-app-foreground',
            )}
          >
            {r === 'all' ? 'All time' : 'Last 7 days'}
          </button>
        ))}
      </div>

      {/* Unavailable banner */}
      {unavailable && !loading && (
        <div className="mt-6 rounded-[16px] border border-app-border bg-app-card/60 p-4 text-sm text-app-muted">
          Token usage tracking is not yet available. It requires the AgentLite token tracking
          feature to be enabled. Usage data will appear here once that feature is active.
        </div>
      )}

      {/* Summary stat cards */}
      {!unavailable && (
        <div className="mt-6 grid grid-cols-3 gap-3">
          {loading ? (
            <>
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="rounded-[20px] border border-app-border bg-app-card/60 p-5 animate-pulse"
                >
                  <div className="h-3 w-16 rounded bg-app-border mb-3" />
                  <div className="h-6 w-24 rounded bg-app-border" />
                </div>
              ))}
            </>
          ) : (
            <>
              <StatCard label="Total cost" value={formatCost(data?.total_cost_usd)} />
              <StatCard
                label="Total tokens"
                value={data ? formatTokens(data.total_tokens) : '--'}
              />
              <StatCard label="Requests" value={data ? String(data.request_count) : '--'} />
            </>
          )}
        </div>
      )}

      {/* By Agent section */}
      {!unavailable && (
        <div className="mt-8">
          <h3 className="text-sm font-medium text-app-foreground mb-4">By agent</h3>
          <div className="space-y-3">
            {loading ? (
              <>
                {[0, 1, 2, 3].map((i) => <SkeletonBar key={i} />)}
              </>
            ) : topBySession.length === 0 ? (
              <p className="text-sm text-app-muted">No agent data for this period.</p>
            ) : (
              topBySession.map((row, i) => (
                <BarRow
                  key={row.session_id}
                  label={row.agent_name ?? row.session_id}
                  value={formatCost(row.cost_usd)}
                  pct={getSessionPct(row)}
                  dimmed={i >= 3}
                />
              ))
            )}
          </div>
        </div>
      )}

      {/* By Model section */}
      {!unavailable && (
        <div className="mt-8">
          <h3 className="text-sm font-medium text-app-foreground mb-4">By model</h3>
          <div className="space-y-3">
            {loading ? (
              <>
                {[0, 1, 2].map((i) => <SkeletonBar key={i} />)}
              </>
            ) : topByModel.length === 0 ? (
              <p className="text-sm text-app-muted">No model data for this period.</p>
            ) : (
              topByModel.map((row, i) => (
                <BarRow
                  key={row.model}
                  label={row.model}
                  value={formatCost(row.cost_usd)}
                  pct={getModelPct(row)}
                  dimmed={i >= 3}
                />
              ))
            )}
          </div>
        </div>
      )}
    </>
  );
}
