// Coding engine card UI.

import { CheckCircle2, CircleDot, AlertCircle, Cpu } from 'lucide-react';

import type { CodingEngineEvent, CodingEngineId } from '@/renderer/features/agents/types';
import { cn } from '@/renderer/shared/lib/utils';

/** Engines label. */
function engineLabel(id: CodingEngineId): string {
  return id === 'claude-code' ? 'Claude Code' : 'Codex';
}

/** Renders the engine status badge UI. */
function EngineStatusBadge({ isRunning, hasError }: { isRunning: boolean; hasError: boolean }) {
  if (hasError) {
    return (
      <span className="ml-auto rounded-full bg-red-100 px-2 py-0.5 font-mono text-[9px] font-medium text-red-600">
        error
      </span>
    );
  }

  if (isRunning) {
    return (
      <span className="ml-auto rounded-full bg-amber-100 px-2 py-0.5 font-mono text-[9px] font-medium text-amber-600">
        running
      </span>
    );
  }

  return (
    <span className="ml-auto rounded-full bg-emerald-100 px-2 py-0.5 font-mono text-[9px] font-medium text-emerald-600">
      done
    </span>
  );
}

/** Renders the step row UI. */
function StepRow({ label, isDone }: { label: string; isDone: boolean }) {
  return (
    <div className="flex items-center gap-2 py-0.5 text-[11px]">
      {isDone ? (
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
      ) : (
        <CircleDot className="h-3.5 w-3.5 shrink-0 animate-pulse text-amber-500" />
      )}
      <span className="truncate text-app-muted">{label}</span>
    </div>
  );
}

/** Coding engine run shape. */
export interface CodingEngineRun {
  engineId: CodingEngineId;
  events: CodingEngineEvent[];
}

/** Groups engine runs. */
export function groupEngineRuns(events: CodingEngineEvent[]): CodingEngineRun[] {
  const runs: CodingEngineRun[] = [];
  let current: CodingEngineRun | null = null;

  for (const event of events) {
    if (event.kind === 'started') {
      current = { engineId: event.engineId, events: [event] };
      runs.push(current);
    } else if (current) {
      current.events.push(event);
    }
  }

  return runs;
}

/** Renders the coding engine card UI. */
export function CodingEngineCard({ run }: { run: CodingEngineRun }) {
  const started = run.events.find((e) => e.kind === 'started');
  const steps = run.events.filter((e) => e.kind === 'step');
  const completed = run.events.find((e) => e.kind === 'completed');
  const error = run.events.find((e) => e.kind === 'error');
  const isRunning = !completed && !error;

  return (
    <div className="overflow-hidden rounded-[14px] border border-app-border bg-app-card/60">
      <div className="flex items-center gap-2 border-b border-app-border bg-app-panel/40 px-3 py-2">
        <Cpu className={cn(
          'h-3.5 w-3.5',
          run.engineId === 'claude-code' ? 'text-app-accent' : 'text-emerald-600',
        )} />
        <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-app-muted">
          {engineLabel(run.engineId)}
        </span>
        <EngineStatusBadge isRunning={isRunning} hasError={!!error} />
      </div>

      <div className="space-y-1 px-3 py-2">
        {started?.prompt ? (
          <p className="text-[11px] leading-5 text-app-muted">
            {started.prompt}
          </p>
        ) : null}

        {steps.length > 0 ? (
          <div className="mt-1 space-y-0.5">
            {steps.map((step) => (
              <StepRow
                isDone={!!completed || !!error}
                key={step.id}
                label={step.stepLabel ?? 'Working...'}
              />
            ))}
          </div>
        ) : null}

        {isRunning && steps.length === 0 ? (
          <div className="flex items-center gap-2 py-1 text-[11px] text-app-muted">
            <CircleDot className="h-3.5 w-3.5 animate-pulse text-amber-500" />
            Working...
          </div>
        ) : null}

        {completed?.result ? (
          <p className="mt-1 rounded-lg bg-app-panel/60 px-2.5 py-1.5 font-mono text-[11px] leading-5 text-app-text">
            {completed.result}
          </p>
        ) : null}

        {error?.error ? (
          <div className="mt-1 flex items-start gap-2 rounded-lg bg-red-50 px-2.5 py-1.5 text-[11px] text-red-600">
            <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
            {error.error}
          </div>
        ) : null}
      </div>
    </div>
  );
}
