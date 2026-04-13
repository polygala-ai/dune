import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { useAppStore, resetAppStore } from '@/renderer/app/store/use-app-store';
import { useAgentSession } from '@/renderer/app/store/selectors';
import { createDefaultExternalChannelsState } from '@/renderer/features/agents/model/channels';
import { createEmptyAgentCustomizationDraft } from '@/renderer/features/agents/model/agent-customization';
import { agentRuntime } from '@/renderer/features/agents/runtime/agent-runtime';

describe('app store agent runtime sync', () => {
  beforeEach(() => {
    resetAppStore();
  });

  it('syncs runtime snapshots into the store through the slice action', async () => {
    const agentId = await agentRuntime.service.createAgent({
      channelId: 'dune-chat',
      name: 'Navigator',
    });

    expect(useAppStore.getState().agents[0]?.id).toBe(agentId);
    expect(useAppStore.getState().selectedAgentId).toBe(agentId);
  });

  it('clears runtime and local draft state on reset', async () => {
    const agentId = await agentRuntime.service.createAgent({
      channelId: 'dune-chat',
      name: 'Navigator',
    });
    useAppStore.getState().setDraft(agentId, 'Pending note');
    useAppStore.getState().upsertAgentCustomization(agentId, {
      ...createEmptyAgentCustomizationDraft(),
      additionalInstructions: 'Keep responses terse.',
    });

    resetAppStore();

    expect(useAppStore.getState().agents).toEqual([]);
    expect(useAppStore.getState().selectedAgentId).toBeNull();
    expect(useAppStore.getState().agentCustomizations).toEqual({});
    expect(useAppStore.getState().agentDrafts).toEqual({});
    expect(agentRuntime.getSnapshot()).toEqual({
      agents: [],
      externalChannels: createDefaultExternalChannelsState(),
      isStreaming: false,
      runtimeInfo: {
        message: 'AgentLite is unavailable, so Dune is using the mock runtime.',
        mode: 'mock-fallback',
        status: 'ready',
      },
      selectedAgentId: null,
      telegramSetupSessions: [],
    });
  });

  it('derives the active draft from the selected agent', async () => {
    const { result } = renderHook(() => useAgentSession());
    let firstAgentId = '';
    let secondAgentId = '';

    await act(async () => {
      firstAgentId = await agentRuntime.service.createAgent({
        channelId: 'dune-chat',
        name: 'Navigator',
      });
      secondAgentId = await agentRuntime.service.createAgent({
        channelId: 'dune-chat',
        name: 'QA triage',
      });
    });

    act(() => {
      useAppStore.getState().setDraft(firstAgentId, 'Draft for navigator');
      agentRuntime.service.selectAgent(secondAgentId);
      useAppStore.getState().setDraft(secondAgentId, 'Draft for QA');
    });

    expect(result.current.draft).toBe('Draft for QA');

    act(() => {
      agentRuntime.service.selectAgent(firstAgentId);
    });

    expect(result.current.draft).toBe('Draft for navigator');
  });

  it('derives the active customization from the selected agent', async () => {
    const { result } = renderHook(() => useAgentSession());
    let firstAgentId = '';
    let secondAgentId = '';

    await act(async () => {
      firstAgentId = await agentRuntime.service.createAgent({
        channelId: 'dune-chat',
        name: 'Navigator',
      });
      secondAgentId = await agentRuntime.service.createAgent({
        channelId: 'dune-chat',
        name: 'QA triage',
      });
    });

    act(() => {
      useAppStore.getState().upsertAgentCustomization(firstAgentId, {
        ...createEmptyAgentCustomizationDraft(),
        additionalInstructions: 'Stay concise.',
      });
      agentRuntime.service.selectAgent(secondAgentId);
    });

    expect(result.current.activeAgentCustomization).toBeNull();

    act(() => {
      agentRuntime.service.selectAgent(firstAgentId);
    });

    expect(result.current.activeAgentCustomization).toEqual({
      additionalInstructions: 'Stay concise.',
      mcpServers: [],
      skills: [],
    });
  });
});
