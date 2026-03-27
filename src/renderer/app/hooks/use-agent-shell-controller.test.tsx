import { renderHook, act, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAgentShellController } from '@/renderer/app/hooks/use-agent-shell-controller';
import type {
  CreateAgentInput,
  PresentedAgent,
} from '@/renderer/features/agents/types';

function createPresentedAgent(): PresentedAgent {
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
    status: 'draft',
    statusLabel: 'Draft',
    updatedAt: Date.now(),
    updatedLabel: 'Now',
    workspace: 'Prototype agent',
  };
}

describe('useAgentShellController', () => {
  const commands = {
    createAgent: vi.fn<(input: CreateAgentInput) => Promise<string>>(),
    openAgent: vi.fn<(agentId: string) => void>(),
    openSettings: vi.fn<() => void>(),
    setCommandOpen: vi.fn<(isOpen: boolean) => void>(),
    setSettingsRoute: vi.fn<(route: 'appearance' | 'channels' | 'models' | 'shortcuts') => void>(),
    toggleInspector: vi.fn<(force?: boolean) => void>(),
  };
  const focusComposer = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    commands.createAgent.mockResolvedValue('agent-1');
  });

  it('opens the create-agent dialog and closes competing shell chrome', () => {
    const { result } = renderHook(() =>
      useAgentShellController({
        activeAgent: null,
        commands,
        focusComposer,
        isCompactShell: true,
        route: 'agent',
      }),
    );

    act(() => {
      result.current.handleSidebarDrawerOpenChange(true);
    });

    act(() => {
      result.current.handleOpenCreateAgent();
    });

    expect(result.current.isCreateAgentOpen).toBe(true);
    expect(result.current.isSidebarDrawerOpen).toBe(false);
    expect(commands.setCommandOpen).toHaveBeenCalledWith(false);
  });

  it('creates and selects an agent through the controller flow', async () => {
    const { result } = renderHook(() =>
      useAgentShellController({
        activeAgent: null,
        commands,
        focusComposer,
        isCompactShell: true,
        route: 'agent',
      }),
    );

    act(() => {
      result.current.handleOpenCreateAgent();
    });

    await act(async () => {
      await result.current.handleCreateAgent({
        channelId: 'dune-chat',
        name: 'Navigator',
      });
    });

    expect(commands.createAgent).toHaveBeenCalledWith({
      channelId: 'dune-chat',
      name: 'Navigator',
    });
    expect(result.current.isCreateAgentOpen).toBe(false);
    expect(result.current.isSidebarDrawerOpen).toBe(false);
    expect(focusComposer).toHaveBeenCalled();
  });

  it('focuses the composer for an active agent and closes the drawer when leaving compact mode', async () => {
    interface ControllerProps {
      activeAgent: PresentedAgent | null;
      isCompactShell: boolean;
    }
    const initialProps: ControllerProps = {
      activeAgent: null,
      isCompactShell: true,
    };

    const { result, rerender } = renderHook(
      ({
        activeAgent,
        isCompactShell,
      }: ControllerProps) =>
        useAgentShellController({
          activeAgent,
          commands,
          focusComposer,
          isCompactShell,
          route: 'agent',
        }),
      {
        initialProps,
      },
    );

    act(() => {
      result.current.handleSidebarDrawerOpenChange(true);
    });

    rerender({
      activeAgent: createPresentedAgent(),
      isCompactShell: false,
    });

    await waitFor(() => {
      expect(result.current.isSidebarDrawerOpen).toBe(false);
      expect(focusComposer).toHaveBeenCalled();
    });
  });

  it('opens channels settings from the create-agent flow', async () => {
    const { result } = renderHook(() =>
      useAgentShellController({
        activeAgent: null,
        commands,
        focusComposer,
        isCompactShell: true,
        route: 'agent',
      }),
    );

    act(() => {
      result.current.handleOpenCreateAgent();
    });

    expect(result.current.isCreateAgentOpen).toBe(true);

    await act(async () => {
      result.current.handleOpenChannelsSettings();
    });

    await waitFor(() => {
      expect(result.current.isCreateAgentOpen).toBe(false);
      expect(commands.openSettings).toHaveBeenCalled();
      expect(commands.setSettingsRoute).toHaveBeenCalledWith('channels');
    });
  });
});
