import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAgentSubmit } from '@/renderer/app/hooks/use-agent-submit';
import { useAppStore, resetAppStore } from '@/renderer/app/store/use-app-store';
import { agentRuntime } from '@/renderer/features/agents/runtime/agent-runtime';
import type { Agent } from '@/renderer/features/agents/types';

function createAgent(overrides: Partial<Agent> = {}): Agent {
  return {
    channel: {
      canCompose: true,
      id: 'dune-chat',
      kind: 'built-in',
      label: 'Dune chat',
      status: 'ready',
    },
    contextCards: [],
    id: 'agent-1',
    messages: [],
    name: 'Navigator',
    note: 'A durable agent workspace.',
    preview: 'Ready for a first instruction.',
    projectId: 'project-1',
    role: 'custom',
    status: 'ready',
    telegram: null,
    updatedAt: Date.now(),
    workspace: 'Prototype agent',
    ...overrides,
  };
}

describe('useAgentSubmit', () => {
  const focusComposer = vi.fn();

  beforeEach(() => {
    vi.restoreAllMocks();
    resetAppStore();
    useAppStore.setState({
      agentDrafts: {
        'agent-1': 'Retain me',
      },
      agents: [createAgent()],
      isStreaming: false,
      selectedAgentId: 'agent-1',
    });
    focusComposer.mockReset();
  });

  it('clears only the selected agent draft after a successful send', async () => {
    const sendMessage = vi.spyOn(agentRuntime.service, 'sendMessage')
      .mockResolvedValue(undefined);
    useAppStore.setState({
      agentDrafts: {
        'agent-1': 'Retain me',
        'agent-2': 'Keep me',
      },
      agents: [
        createAgent(),
        createAgent({
          id: 'agent-2',
          name: 'QA triage',
        }),
      ],
    });
    const { result } = renderHook(() => useAgentSubmit({ focusComposer }));

    await act(async () => {
      await result.current('  Refine the startup path  ');
    });

    expect(sendMessage).toHaveBeenCalledWith('agent-1', 'Refine the startup path');
    expect(useAppStore.getState().agentDrafts).toEqual({
      'agent-2': 'Keep me',
    });
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
    expect(useAppStore.getState().agentDrafts).toEqual({
      'agent-1': 'Retain me',
    });
    expect(consoleError).toHaveBeenCalledWith(
      'Failed to send message to agent "agent-1".',
      sendError,
    );
    expect(focusComposer).toHaveBeenCalledTimes(1);
  });

  it('allows sending to a ready agent while another agent is streaming', async () => {
    const sendMessage = vi.spyOn(agentRuntime.service, 'sendMessage')
      .mockResolvedValue(undefined);
    useAppStore.setState({
      agentDrafts: {
        'agent-2': 'Handle the QA follow-up',
      },
      agents: [
        createAgent({
          id: 'agent-1',
          name: 'Navigator',
          status: 'live',
        }),
        createAgent({
          id: 'agent-2',
          name: 'QA triage',
          status: 'ready',
        }),
      ],
      isStreaming: true,
      selectedAgentId: 'agent-2',
    });
    const { result } = renderHook(() => useAgentSubmit({ focusComposer }));

    await act(async () => {
      await result.current('  Handle the QA follow-up  ');
    });

    expect(sendMessage).toHaveBeenCalledWith('agent-2', 'Handle the QA follow-up');
    expect(useAppStore.getState().agentDrafts).toEqual({});
  });

  it('blocks sending when the selected agent is already streaming', async () => {
    const sendMessage = vi.spyOn(agentRuntime.service, 'sendMessage')
      .mockResolvedValue(undefined);
    useAppStore.setState({
      agents: [
        createAgent({
          status: 'live',
        }),
      ],
    });
    const { result } = renderHook(() => useAgentSubmit({ focusComposer }));

    await act(async () => {
      await result.current('Retain me');
    });

    expect(sendMessage).not.toHaveBeenCalled();
    expect(useAppStore.getState().agentDrafts).toEqual({
      'agent-1': 'Retain me',
    });
  });
});
