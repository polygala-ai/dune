import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useConversationSubmit } from '@/renderer/app/hooks/use-conversation-submit';
import {
  resetAppStore,
  useAppStore,
} from '@/renderer/app/store/use-app-store';

import type { ChatTransport } from '@/renderer/features/chat/model/chat-transport';

interface SubmitHarnessProps {
  focusComposer: () => void;
  transport: ChatTransport;
}

function SubmitHarness({
  focusComposer,
  transport,
}: SubmitHarnessProps) {
  const submit = useConversationSubmit({
    focusComposer,
    transport,
  });

  return (
    <button
      onClick={() => {
        void submit('Refine the settings surface');
      }}
      type="button"
    >
      Submit
    </button>
  );
}

describe('useConversationSubmit', () => {
  beforeEach(() => {
    resetAppStore();
  });

  it('streams assistant content through the provided transport', async () => {
    const user = userEvent.setup();
    const focusComposer = vi.fn();
    const transport: ChatTransport = {
      streamReply: async function* streamReply() {
        await Promise.resolve();
        yield 'First';
        yield ' reply';
      },
    };

    render(
      <SubmitHarness
        focusComposer={focusComposer}
        transport={transport}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Submit' }));

    await waitFor(() => {
      const conversation = useAppStore.getState().conversations[0];
      const lastMessage = conversation?.messages.at(-1);

      expect(lastMessage?.content).toBe('First reply');
      expect(lastMessage?.status).toBe('complete');
      expect(useAppStore.getState().isStreaming).toBe(false);
    });

    expect(focusComposer).toHaveBeenCalled();
  });

  it('writes the fallback assistant message when streaming fails', async () => {
    const user = userEvent.setup();
    const focusComposer = vi.fn();
    const transport: ChatTransport = {
      streamReply: async function* streamReply() {
        await Promise.resolve();
        throw new Error('network down');
        yield '';
      },
    };

    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    render(
      <SubmitHarness
        focusComposer={focusComposer}
        transport={transport}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Submit' }));

    await waitFor(() => {
      const conversation = useAppStore.getState().conversations[0];
      const lastMessage = conversation?.messages.at(-1);

      expect(lastMessage?.content).toMatch(/prototype reply stalled/i);
      expect(lastMessage?.status).toBe('complete');
      expect(useAppStore.getState().isStreaming).toBe(false);
    });

    consoleError.mockRestore();
  });
});
