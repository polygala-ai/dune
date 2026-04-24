// Budget exceeded banner UI.

import { AlertTriangle, RefreshCcw } from 'lucide-react';

import { Button } from '@/renderer/shared/ui/button';

interface BudgetExceededBannerProps {
  agentId: string;
  limitType: 'daily' | 'total';
  limitUsd: number;
  onResume: () => void;
  usedUsd: number;
}

function formatUsd(value: number) {
  return `$${value.toFixed(2)}`;
}

/** Renders a budget exceeded pause banner. */
export function BudgetExceededBanner({
  agentId,
  limitType,
  limitUsd,
  onResume,
  usedUsd,
}: BudgetExceededBannerProps) {
  const resume = async () => {
    await window.duneDesktop?.resumeBudget?.(agentId);
    onResume();
  };

  return (
    <div className="message-reveal flex items-center justify-between gap-3 rounded-[18px] border border-red-300/70 bg-red-50 px-4 py-3 text-red-800">
      <div className="flex min-w-0 items-center gap-3">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        <p className="min-w-0 text-sm font-medium leading-5">
          Agent paused - {limitType} token budget exceeded ({formatUsd(usedUsd)} of {formatUsd(limitUsd)} used)
        </p>
      </div>
      <Button
        className="shrink-0 border-red-300/70 text-red-800 hover:border-red-400 hover:bg-red-100"
        onClick={() => void resume()}
        size="sm"
        type="button"
        variant="outline"
      >
        <RefreshCcw className="h-4 w-4" />
        Resume
      </Button>
    </div>
  );
}
