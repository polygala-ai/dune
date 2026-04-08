import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAgentSubmit } from '@/renderer/app/hooks/use-agent-submit';
import { useAppStore, resetAppStore } from '@/renderer/app/store/use-app-store';
import { agentRuntime } from '@/renderer/features/agents/runtime/agent-runtime';

describe('useAgentSubmit', () => {
  const focusComposer = vi.fn();

  beforeEach(() => {
    vi.restoreAllMocks();
    resetAppStore();
    useAppStore.setState({
      draft: 'Retain me',
      isStreaming: false,
      selectedAgentId: 'agent-1',
    });
    focusComposer.mockReset();
  });

  it('clears the draft after a successful send', async () => {
    const sendMessage = vi.spyOn(agentRuntime.service, 'sendMessage')
      .mockResolvedValue(undefined);
    const { result } = renderHook(() => useAgentSubmit({ focusComposer }));

    await act(async () => {
      await result.current('  Refine the startup path  ');
    });

    expect(sendMessage).toHaveBeenCalledWith('agent-1', 'Refine the startup path');
    expect(useAppStore.getState().draft).toBe('');
    expect(focusComposer).toHaveBeenCalledTimes(1);
  });

  it('preserves the draft and logs when send fails', async () => {
    const sendError = new Error('runtime unavailable');
    const sendMessage = vi.spyOn(agentRuntime.service, 'sendMessage')
      .mockRejectedValue(sendError);
    const consoleError = vi.spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const { result } = renderHook(() => useAgentSubmit({ focusComposer }));

    await act(async () => {
      await result.current('  Retain me  ');
    });

    expect(sendMessage).toHaveBeenCalledWith('agent-1', 'Retain me');
    expect(useAppStore.getState().draft).toBe('Retain me');
    expect(consoleError).toHaveBeenCalledWith(
      'Failed to send message to agent "agent-1".',
      sendError,
    );
    expect(focusComposer).toHaveBeenCalledTimes(1);
  });
});
