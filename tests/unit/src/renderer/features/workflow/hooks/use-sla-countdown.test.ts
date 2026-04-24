import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useSlaCountdown } from '@/renderer/features/workflow/hooks/use-sla-countdown';

describe('useSlaCountdown', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns null without an SLA deadline', () => {
    const { result } = renderHook(() => useSlaCountdown());

    expect(result.current).toBeNull();
  });

  it('reports warning state inside the final two hours', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);

    const { result } = renderHook(() => useSlaCountdown(1_000 + 60 * 60 * 1000));

    expect(result.current).toEqual({
      isBreached: false,
      isWarning: true,
      msLeft: 60 * 60 * 1000,
    });
  });

  it('updates on minute ticks and reports breached deadlines', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);

    const { result } = renderHook(() => useSlaCountdown(61_000));

    expect(result.current?.isBreached).toBe(false);

    act(() => {
      vi.advanceTimersByTime(60_000);
    });

    expect(result.current).toMatchObject({
      isBreached: true,
      isWarning: false,
    });
    expect(result.current?.msLeft).toBeLessThanOrEqual(0);
  });
});
