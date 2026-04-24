// SLA countdown hook.

import { useEffect, useState } from 'react';

import type { WorkflowItemStatus } from '@/renderer/features/workflow/types';
import { getSlaState } from '@/shared/workflow/priority-sla';

export function useSlaCountdown(
  slaDeadlineMs: number | undefined,
  status: WorkflowItemStatus,
) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!slaDeadlineMs) {
      return;
    }

    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, [slaDeadlineMs]);

  return getSlaState(slaDeadlineMs, status, now);
}
