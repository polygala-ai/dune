import type {
  AgentStatus,
  MessageStatus,
} from '@/renderer/features/agents/types';

const MINUTE_IN_MS = 60_000;
const DAY_IN_MS = 24 * 60 * 60 * 1000;

const timeFormatter = new Intl.DateTimeFormat('en', {
  hour: '2-digit',
  hour12: false,
  minute: '2-digit',
});

const dateFormatter = new Intl.DateTimeFormat('en', {
  day: 'numeric',
  month: 'short',
});

const dateWithYearFormatter = new Intl.DateTimeFormat('en', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

function startOfDay(timestamp: number) {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function isSameDay(left: number, right: number) {
  return startOfDay(left) === startOfDay(right);
}

function isYesterday(timestamp: number, now: number) {
  return startOfDay(now) - startOfDay(timestamp) === DAY_IN_MS;
}

function formatCalendarDate(timestamp: number, now: number) {
  const formatter =
    new Date(timestamp).getFullYear() === new Date(now).getFullYear()
      ? dateFormatter
      : dateWithYearFormatter;

  return formatter.format(timestamp);
}

export function formatAgentTimestamp(timestamp: number, now: number = Date.now()) {
  if (now - timestamp < 2 * MINUTE_IN_MS) {
    return 'Now';
  }

  if (isSameDay(timestamp, now)) {
    return `Today · ${timeFormatter.format(timestamp)}`;
  }

  if (isYesterday(timestamp, now)) {
    return 'Yesterday';
  }

  return formatCalendarDate(timestamp, now);
}

export function formatMessageTimestamp(timestamp: number, now: number = Date.now()) {
  if (now - timestamp < 2 * MINUTE_IN_MS) {
    return 'Now';
  }

  if (isSameDay(timestamp, now)) {
    return timeFormatter.format(timestamp);
  }

  if (isYesterday(timestamp, now)) {
    return 'Yesterday';
  }

  return formatCalendarDate(timestamp, now);
}

export function formatAgentStatus(status: AgentStatus) {
  switch (status) {
    case 'draft':
      return 'Draft';
    case 'live':
      return 'Live';
    case 'ready':
      return 'Ready';
  }
}

export function formatMessageStatus(status: MessageStatus) {
  switch (status) {
    case 'complete':
      return 'Complete';
    case 'streaming':
      return 'Streaming';
  }
}

