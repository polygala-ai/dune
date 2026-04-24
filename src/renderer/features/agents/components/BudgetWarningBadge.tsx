// Budget warning badge UI.

import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';

interface BudgetWarningBadgeProps {
  limitType: 'daily' | 'total';
  pctUsed: number;
}

function formatPct(value: number) {
  const pct = value <= 1 ? value * 100 : value;

  return `${Math.round(pct)}%`;
}

/** Renders a dismissible budget warning badge. */
export function BudgetWarningBadge({ limitType, pctUsed }: BudgetWarningBadgeProps) {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    setIsVisible(true);
    const timeout = window.setTimeout(() => {
      setIsVisible(false);
    }, 30_000);

    return () => window.clearTimeout(timeout);
  }, [limitType, pctUsed]);

  if (!isVisible) {
    return null;
  }

  return (
    <button
      className="message-reveal inline-flex w-fit items-center gap-2 rounded-full border border-amber-300/70 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-800 transition-colors hover:bg-amber-100"
      onClick={() => setIsVisible(false)}
      type="button"
    >
      <AlertTriangle className="h-3.5 w-3.5" />
      <span>{formatPct(pctUsed)} {limitType} budget used</span>
    </button>
  );
}
