import { useEffectEvent } from 'react';

import { useAppStore } from '@/renderer/app/store/use-app-store';
import { selectAgentById } from '@/renderer/features/agents/model/agent-presenters';
import { agentRuntime } from '@/renderer/features/agents/runtime/agent-runtime';

interface UseAgentSubmitOptions {
  focusComposer: () => void;
}

export function useAgentSubmit({ focusComposer }: UseAgentSubmitOptions) {
  return useEffectEvent(async (rawValue: string) => {
    const value = rawValue.trim();
    const {
      agents,
      selectedAgentId,
      setDraft,
    } = useAppStore.getState();
    const selectedAgent = selectAgentById(agents, selectedAgentId);

    if (
      !value
      || !selectedAgentId
      || !selectedAgent?.channel.canCompose
      || selectedAgent.status === 'live'
    ) {
      return;
    }

    try {
      await agentRuntime.service.sendMessage(selectedAgentId, value);
      setDraft(selectedAgentId, '');
    } catch (error) {
      console.error(`Failed to send message to agent "${selectedAgentId}".`, error);
    } finally {
      focusComposer();
    }
  });
}
