import { createRef } from 'react';
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { AgentPanel } from '@/renderer/features/agents/components/AgentPanel';
import type { AgentActivityEvent, PresentedAgent, PresentedAgentMessage } from '@/renderer/features/agents/types';

function createMessage(
  overrides: Partial<PresentedAgentMessage> = {},
): PresentedAgentMessage {
  return {
    attachments: [],
    content: '',
    createdAt: 1,
    createdAtLabel: 'Now',
    format: 'plain',
    id: 'message-1',
    role: 'assistant',
    status: 'complete',
    ...overrides,
  };
}

function createActivityEvent(
  overrides: Partial<AgentActivityEvent> = {},
): AgentActivityEvent {
  return {
    id: 'activity-1',
    kind: 'status',
    label: 'thinking',
    timestamp: 1,
    ...overrides,
  };
}

function createAgent(
  overrides: Partial<PresentedAgent> = {},
): PresentedAgent {
  return {
    activityEvents: [],
    channel: {
      canCompose: true,
      id: 'dune-chat',
      kind: 'built-in',
      label: 'Dune chat',
      status: 'ready',
    },
    codingEngineEvents: [],
    contextCards: [],
    id: 'agent-1',
    messages: [],
    name: 'Navigator',
    note: 'A durable agent workspace.',
    preview: 'Ready for a first instruction.',
    projectId: 'project-1',
    role: 'custom',
    status: 'ready',
    statusLabel: 'Ready',
    telegram: null,
    updatedAt: 1,
    updatedLabel: 'Now',
    workspace: 'AgentLite agent',
    ...overrides,
  };
}

function getTranscriptItems(container: HTMLElement) {
  return Array.from(container.querySelectorAll('.message-reveal'))
    .map((node) => node.textContent?.replace(/\s+/g, ' ').trim() ?? '');
}

describe('AgentPanel', () => {
  it('renders pills and messages in chronological order even when source arrays are shuffled', () => {
    const { container } = render(
      <AgentPanel
        agent={createAgent({
          activityEvents: [
            createActivityEvent({ id: 'activity-2', kind: 'status', label: 'thinking', timestamp: 650 }),
            createActivityEvent({ id: 'activity-1', kind: 'tool', label: 'search docs', timestamp: 200 }),
          ],
          messages: [
            createMessage({ content: 'First answer', createdAt: 300, createdAtLabel: 'T300', id: 'message-2', role: 'assistant' }),
            createMessage({ content: 'Follow-up request', createdAt: 500, createdAtLabel: 'T500', format: 'plain', id: 'message-3', role: 'user' }),
            createMessage({ content: 'Second answer', createdAt: 700, createdAtLabel: 'T700', id: 'message-4', role: 'assistant' }),
            createMessage({ content: 'Initial request', createdAt: 100, createdAtLabel: 'T100', format: 'plain', id: 'message-1', role: 'user' }),
          ],
        })}
        composerRef={createRef<HTMLTextAreaElement>()}
        draft=""
        onDraftChange={vi.fn()}
        onSubmit={vi.fn(() => Promise.resolve(undefined))}
        transcriptRef={createRef<HTMLDivElement>()}
      />,
    );

    const items = getTranscriptItems(container);

    expect(items).toHaveLength(6);
    expect(items[0]).toContain('Initial request');
    expect(items[1]).toContain('search docs');
    expect(items[2]).toContain('First answer');
    expect(items[3]).toContain('Follow-up request');
    expect(items[4]).toContain('thinking');
    expect(items[5]).toContain('Second answer');
  });

  it('keeps the user message ahead of the assistant message when timestamps match', () => {
    const { container } = render(
      <AgentPanel
        agent={createAgent({
          messages: [
            createMessage({ content: 'Assistant reply', createdAt: 100, createdAtLabel: 'T100', id: 'message-assistant', role: 'assistant' }),
            createMessage({ content: 'User prompt', createdAt: 100, createdAtLabel: 'T100', format: 'plain', id: 'message-user', role: 'user' }),
          ],
        })}
        composerRef={createRef<HTMLTextAreaElement>()}
        draft=""
        onDraftChange={vi.fn()}
        onSubmit={vi.fn(() => Promise.resolve(undefined))}
        transcriptRef={createRef<HTMLDivElement>()}
      />,
    );

    const items = getTranscriptItems(container);

    expect(items).toHaveLength(2);
    expect(items[0]).toContain('User prompt');
    expect(items[1]).toContain('Assistant reply');
  });
});
