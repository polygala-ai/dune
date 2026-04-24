// SLA countdown hook tests.

import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useSlaCountdown } from '@/renderer/features/workflow/hooks/use-sla-countdown';

describe('useSlaCountdown', () => {
  it('computes warning, breached, and met states', () => {
    const now = new Date('2026-04-24T12:00:00.000Z').getTime();
    vi.useFakeTimers();
    vi.setSystemTime(now);

    expect(renderHook(() => useSlaCountdown(now + 60 * 60_000, 'active')).result.current).toMatchObject({
      isBreached: false,
      isMet: false,
      isWarning: true,
      msLeft: 60 * 60_000,
    });

    expect(renderHook(() => useSlaCountdown(now - 1, 'review')).result.current).toMatchObject({
      isBreached: true,
      isMet: false,
      isWarning: false,
      msLeft: -1,
    });

    expect(renderHook(() => useSlaCountdown(now - 1, 'acceptance')).result.current).toMatchObject({
      isBreached: false,
      isMet: true,
      isWarning: false,
      msLeft: -1,
    });

    vi.useRealTimers();
  });
});
