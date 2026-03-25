import { describe, expect, it } from 'vitest';

import {
  formatConversationStatus,
  formatConversationTimestamp,
  formatMessageTimestamp,
} from '@/renderer/features/chat/model/time';

describe('chat time presenters', () => {
  const now = new Date('2026-03-25T18:30:00.000Z').getTime();

  it('formats current-day conversation timestamps as today labels', () => {
    expect(formatConversationTimestamp(now - 45 * 60_000, now)).toMatch(
      /^Today · \d{2}:\d{2}$/,
    );
  });

  it('formats recent timestamps as now for messages', () => {
    expect(formatMessageTimestamp(now - 45_000, now)).toBe('Now');
  });

  it('formats prior-day timestamps as yesterday labels', () => {
    expect(formatConversationTimestamp(now - 24 * 60 * 60_000, now)).toBe(
      'Yesterday',
    );
    expect(formatMessageTimestamp(now - 24 * 60 * 60_000, now)).toBe('Yesterday');
  });

  it('formats conversation statuses for display', () => {
    expect(formatConversationStatus('draft')).toBe('Draft');
    expect(formatConversationStatus('live')).toBe('Live');
    expect(formatConversationStatus('ready')).toBe('Ready');
  });
});
