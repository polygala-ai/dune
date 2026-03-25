import { useAppStore } from '@/renderer/app/store/use-app-store';
import { agentRuntime } from '@/renderer/features/agents/runtime/agent-runtime';
import type { CreateAgentInput } from '@/renderer/features/agents/types';

import type {
  SettingsRoute,
  ThemePreference,
} from '@/renderer/features/settings/types';

function getAgentByOffset(
  agentIds: string[],
  selectedAgentId: string | null,
  direction: -1 | 1,
) {
  if (!selectedAgentId) {
    return agentIds[0] ?? null;
  }

  const currentIndex = agentIds.findIndex((id) => id === selectedAgentId);

  if (currentIndex === -1 || agentIds.length === 0) {
    return null;
  }

  const nextIndex = (currentIndex + direction + agentIds.length) % agentIds.length;

  return agentIds[nextIndex] ?? null;
}

export async function createAgent(input: CreateAgentInput) {
  const state = useAppStore.getState();
  const nextAgentId = await agentRuntime.service.createAgent(input);

  state.setRoute('agent');

  return nextAgentId;
}

export function openAgent(agentId: string) {
  const state = useAppStore.getState();

  agentRuntime.service.selectAgent(agentId);
  state.setRoute('agent');
}

export function cycleAgent(direction: -1 | 1) {
  const state = useAppStore.getState();
  const nextAgentId = getAgentByOffset(
    state.agents.map((agent) => agent.id),
    state.selectedAgentId,
    direction,
  );

  if (!nextAgentId) {
    return;
  }

  agentRuntime.service.selectAgent(nextAgentId);
  state.setRoute('agent');
}

export function openSettings() {
  const state = useAppStore.getState();

  state.setCommandOpen(false);
  state.setRoute('settings');
}

export function setCommandOpen(isOpen: boolean) {
  useAppStore.getState().setCommandOpen(isOpen);
}

export function toggleInspector(force?: boolean) {
  const state = useAppStore.getState();

  state.setContextPanelOpen(typeof force === 'boolean' ? force : !state.isContextPanelOpen);
}

export function setDraft(draft: string) {
  useAppStore.getState().setDraft(draft);
}

export function setSettingsRoute(route: SettingsRoute) {
  useAppStore.getState().setSettingsRoute(route);
}

export function setThemePreference(preference: ThemePreference) {
  useAppStore.getState().setThemePreference(preference);
}

export function useAppCommands() {
  return {
    createAgent,
    cycleAgent,
    openAgent,
    openSettings,
    setCommandOpen,
    setDraft,
    setSettingsRoute,
    setThemePreference,
    toggleInspector,
  };
}
