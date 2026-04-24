// Budget settings UI.

import { useEffect, useMemo, useState } from 'react';
import { PauseCircle, RefreshCcw, Save } from 'lucide-react';

import type { SettingsSectionComponentProps } from '@/renderer/features/settings/config/settings-sections';
import { cn } from '@/renderer/shared/lib/utils';
import { Button } from '@/renderer/shared/ui/button';
import { Input } from '@/renderer/shared/ui/input';
import type { BudgetConfig, BudgetResult } from '@/shared/electron/desktop-bridge';

import { SettingsSectionIntro } from './SettingsSectionIntro';

interface BudgetAgentCardProps {
  agent: SettingsSectionComponentProps['agents'][number];
}

interface BudgetFormState {
  dailyLimit: string;
  resetHour: number;
  totalLimit: string;
}

const moneyFormatter = new Intl.NumberFormat('en-US', {
  currency: 'USD',
  maximumFractionDigits: 4,
  minimumFractionDigits: 2,
  style: 'currency',
});

function formatMoney(value: number) {
  return moneyFormatter.format(value);
}

function formatPct(value: number | null) {
  if (value === null || !Number.isFinite(value)) {
    return 'No limit';
  }

  const pct = value <= 1 ? value * 100 : value;

  return `${Math.round(pct)}%`;
}

function limitToInput(value: number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : '';
}

function parseLimit(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  const parsed = Number(trimmed);

  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function createInitialForm(budget: BudgetResult | null): BudgetFormState {
  return {
    dailyLimit: limitToInput(budget?.config.daily_limit_usd),
    resetHour: budget?.config.reset_hour ?? 0,
    totalLimit: limitToInput(budget?.config.total_limit_usd),
  };
}

function BudgetAgentCard({ agent }: BudgetAgentCardProps) {
  const [budget, setBudget] = useState<BudgetResult | null>(null);
  const [form, setForm] = useState<BudgetFormState>(() => createInitialForm(null));
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const loadBudget = async () => {
    setIsLoading(true);
    const nextBudget = await window.duneDesktop?.getBudget?.(agent.id) ?? null;
    setBudget(nextBudget);
    setForm(createInitialForm(nextBudget));
    setIsLoading(false);
  };

  useEffect(() => {
    let isMounted = true;

    const load = async () => {
      setIsLoading(true);
      const nextBudget = await window.duneDesktop?.getBudget?.(agent.id) ?? null;

      if (!isMounted) {
        return;
      }

      setBudget(nextBudget);
      setForm(createInitialForm(nextBudget));
      setIsLoading(false);
    };

    void load();

    return () => {
      isMounted = false;
    };
  }, [agent.id]);

  const config = useMemo<Partial<BudgetConfig>>(() => ({
    daily_limit_usd: parseLimit(form.dailyLimit),
    reset_hour: form.resetHour,
    total_limit_usd: parseLimit(form.totalLimit),
  }), [form]);

  const dailyLimitLabel = budget?.config.daily_limit_usd === null || budget?.config.daily_limit_usd === undefined
    ? 'No limit'
    : formatMoney(budget.config.daily_limit_usd);
  const totalLimitLabel = budget?.config.total_limit_usd === null || budget?.config.total_limit_usd === undefined
    ? 'No limit'
    : formatMoney(budget.config.total_limit_usd);

  const saveBudget = async () => {
    setIsSaving(true);
    setFeedback(null);

    try {
      await window.duneDesktop?.setBudget?.(agent.id, config);
      await loadBudget();
      setFeedback('Saved');
    } finally {
      setIsSaving(false);
    }
  };

  const resumeBudget = async () => {
    await window.duneDesktop?.resumeBudget?.(agent.id);
    await loadBudget();
  };

  return (
    <section className="rounded-[20px] border border-app-border bg-app-card/60 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-app-text">{agent.name}</h3>
          <p className="mt-1 text-xs leading-5 text-app-muted">
            {isLoading ? 'Loading budget state...' : `Reset hour ${budget?.config.reset_hour ?? form.resetHour}:00`}
          </p>
        </div>
        {budget?.state.paused ? (
          <div className="flex items-center gap-2 rounded-full border border-red-300/60 bg-red-50 px-3 py-1 text-xs font-medium text-red-700">
            <PauseCircle className="h-3.5 w-3.5" />
            Paused
          </div>
        ) : null}
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-[1fr_1fr_120px]">
        <label className="space-y-2">
          <span className="text-xs font-medium text-app-muted">Daily limit</span>
          <Input
            min="0"
            onChange={(event) => setForm((current) => ({
              ...current,
              dailyLimit: event.target.value,
            }))}
            placeholder="No limit"
            step="0.001"
            type="number"
            value={form.dailyLimit}
          />
        </label>
        <label className="space-y-2">
          <span className="text-xs font-medium text-app-muted">Total limit</span>
          <Input
            min="0"
            onChange={(event) => setForm((current) => ({
              ...current,
              totalLimit: event.target.value,
            }))}
            placeholder="No limit"
            step="0.001"
            type="number"
            value={form.totalLimit}
          />
        </label>
        <label className="space-y-2">
          <span className="text-xs font-medium text-app-muted">Reset</span>
          <select
            className="focus-ring-app h-11 w-full rounded-[16px] border border-app-border bg-app-panel px-3 py-2 text-sm text-app-text outline-none transition-colors focus-visible:border-app-border-strong focus-visible:ring-2"
            onChange={(event) => setForm((current) => ({
              ...current,
              resetHour: Number(event.target.value),
            }))}
            value={form.resetHour}
          >
            {Array.from({ length: 24 }, (_, hour) => (
              <option key={hour} value={hour}>
                {hour}:00
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2">
        <div className="rounded-[16px] border border-app-border bg-app-panel/50 px-4 py-3">
          <div className="text-xs font-medium text-app-muted">Daily usage</div>
          <div className="mt-1 text-sm text-app-text">
            {formatMoney(budget?.usage.daily_cost_usd ?? 0)} / {dailyLimitLabel}
          </div>
          <div className="mt-1 font-mono text-[11px] text-app-muted">
            {formatPct(budget?.usage.daily_pct ?? null)}
          </div>
        </div>
        <div className="rounded-[16px] border border-app-border bg-app-panel/50 px-4 py-3">
          <div className="text-xs font-medium text-app-muted">Total usage</div>
          <div className="mt-1 text-sm text-app-text">
            {formatMoney(budget?.usage.total_cost_usd ?? 0)} / {totalLimitLabel}
          </div>
          <div className="mt-1 font-mono text-[11px] text-app-muted">
            {formatPct(budget?.usage.total_pct ?? null)}
          </div>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <p className={cn('text-xs text-app-muted', feedback && 'text-app-text')}>
          {feedback ?? 'Empty limit fields are saved as no limit.'}
        </p>
        <div className="flex items-center gap-2">
          {budget?.state.paused ? (
            <Button onClick={() => void resumeBudget()} size="sm" type="button" variant="outline">
              <RefreshCcw className="h-4 w-4" />
              Resume
            </Button>
          ) : null}
          <Button disabled={isSaving} onClick={() => void saveBudget()} size="sm" type="button">
            <Save className="h-4 w-4" />
            {isSaving ? 'Saving' : 'Save'}
          </Button>
        </div>
      </div>
    </section>
  );
}

/** Renders the budget settings UI. */
export function BudgetSettings({ agents }: SettingsSectionComponentProps) {
  return (
    <>
      <SettingsSectionIntro
        description="Set daily and lifetime token spend controls for each local agent."
        eyebrow="Budget"
        title="Token spend limits"
      />

      <div className="mt-6 space-y-4">
        {agents.length > 0 ? (
          agents.map((agent) => (
            <BudgetAgentCard agent={agent} key={agent.id} />
          ))
        ) : (
          <div className="rounded-[20px] border border-dashed border-app-border bg-app-card/60 px-5 py-6 text-sm leading-6 text-app-muted">
            Create an agent before setting token budgets.
          </div>
        )}
      </div>
    </>
  );
}
