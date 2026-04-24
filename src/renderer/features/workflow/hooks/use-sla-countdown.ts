import { useEffect, useState } from 'react';

/** Returns live SLA countdown state for a deadline timestamp. */
export function useSlaCountdown(slaDeadlineMs?: number) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!slaDeadlineMs) return;
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, [slaDeadlineMs]);

  if (!slaDeadlineMs) return null;

  const msLeft = slaDeadlineMs - now;
  return {
    isBreached: msLeft <= 0,
    isWarning: msLeft > 0 && msLeft <= 2 * 60 * 60 * 1000,
    msLeft,
  };
}
