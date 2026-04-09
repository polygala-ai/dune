import { describe, expect, it } from 'vitest';

import {
  formatAgentStatus,
  formatAgentTimestamp,
  formatMessageTimestamp,
} from '@/renderer/features/agents/model/time';

describe('agent time presenters', () => {
  const now = new Date('2026-03-25T18:30:00.000Z').getTime();

  it('formats current-day agent timestamps as today labels', () => {
    expect(formatAgentTimestamp(now - 45 * 60_000, now)).toMatch(
      /^Today · \d{2}:\d{2}$/,
    );
  });

  it('formats recent timestamps as now for messages', () => {
    expect(formatMessageTimestamp(now - 45_000, now)).toBe('Now');
  });

  it('formats prior-day timestamps as yesterday labels', () => {
    expect(formatAgentTimestamp(now - 24 * 60 * 60_000, now)).toBe('Yesterday');
    expect(formatMessageTimestamp(now - 24 * 60 * 60_000, now)).toBe('Yesterday');
  });

  it('formats agent statuses for display', () => {
    expect(formatAgentStatus('draft')).toBe('Draft');
    expect(formatAgentStatus('live')).toBe('Streaming');
    expect(formatAgentStatus('ready')).toBe('Ready');
  });
});
