import { useEffectEvent } from 'react';

import { useAppStore } from '@/renderer/app/store/use-app-store';
import { agentRuntime } from '@/renderer/features/agents/runtime/agent-runtime';

interface UseAgentSubmitOptions {
  focusComposer: () => void;
}

export function useAgentSubmit({ focusComposer }: UseAgentSubmitOptions) {
  const isStreaming = useAppStore((state) => state.isStreaming);
  const selectedAgentId = useAppStore((state) => state.selectedAgentId);
  const setDraft = useAppStore((state) => state.setDraft);

  return useEffectEvent(async (rawValue: string) => {
    const value = rawValue.trim();

    if (!value || isStreaming || !selectedAgentId) {
      return;
    }

    try {
      await agentRuntime.service.sendMessage(selectedAgentId, value);
      setDraft('');
    } catch (error) {
      console.error(`Failed to send message to agent "${selectedAgentId}".`, error);
    } finally {
      focusComposer();
    }
  });
}
