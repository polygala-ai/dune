import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { AgentMessageContent } from '@/renderer/features/agents/components/AgentMessageContent';
import type { PresentedAgentMessage } from '@/renderer/features/agents/types';

function createMessage(
  overrides: Partial<PresentedAgentMessage> = {},
): PresentedAgentMessage {
  return {
    attachments: [],
    content: '',
    createdAt: Date.now(),
    createdAtLabel: 'Now',
    format: 'markdown',
    id: 'message-1',
    role: 'assistant',
    status: 'complete',
    ...overrides,
  };
}

describe('AgentMessageContent', () => {
  it('renders markdown, attachments, and opens safe links externally', async () => {
    const user = userEvent.setup();

    render(
      <AgentMessageContent
        message={createMessage({
          attachments: [
            {
              kind: 'image',
              name: 'diagram.png',
              url: 'file:///tmp/diagram.png',
            },
            {
              kind: 'file',
              name: 'report.pdf',
              url: 'file:///tmp/report.pdf',
            },
          ],
          content: [
            '# Release Notes',
            '',
            'See [docs](https://example.com/docs) and [blocked](file:///tmp/blocked.txt).',
            '',
            '- first',
            '- second',
            '',
            '| Name | Value |',
            '| --- | --- |',
            '| alpha | beta |',
            '',
            '```ts',
            'const count = 1;',
            '```',
          ].join('\n'),
        })}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Release Notes' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'docs' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'blocked' })).not.toBeInTheDocument();
    expect(screen.getByText('alpha')).toBeInTheDocument();
    expect(screen.getByText('const count = 1;')).toBeInTheDocument();
    expect(screen.getByAltText('diagram.png')).toHaveAttribute('src', 'file:///tmp/diagram.png');
    expect(screen.getByRole('link', { name: 'report.pdf' })).toHaveAttribute(
      'href',
      'file:///tmp/report.pdf',
    );

    await user.click(screen.getByRole('link', { name: 'docs' }));

    expect(window.duneDesktop?.openExternal).toHaveBeenCalledWith('https://example.com/docs');
  });

  it('preserves plain-text formatting without markdown parsing', () => {
    const { container } = render(
      <AgentMessageContent
        message={createMessage({
          content: 'line 1\nline 2',
          format: 'plain',
        })}
      />,
    );

    expect(container.querySelector('.prose-message-plain')?.textContent).toBe('line 1\nline 2');
  });
});
