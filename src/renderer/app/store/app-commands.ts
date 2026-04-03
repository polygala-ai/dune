import { useAppStore } from '@/renderer/app/store/use-app-store';
import { agentRuntime } from '@/renderer/features/agents/runtime/agent-runtime';
import type { CreateAgentInput } from '@/renderer/features/agents/types';
import type { WorkflowProjectView } from '@/renderer/features/workflow/types';

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

function openProjectView(view: WorkflowProjectView) {
  const state = useAppStore.getState();

  state.setCommandOpen(false);
  state.selectProjectView(view);
  state.setRoute('workflow');
}

export async function createAgent(input: CreateAgentInput) {
  return createAgentWithOptions(input, { openRoute: true });
}

export async function createAgentWithOptions(
  input: CreateAgentInput,
  options: { openRoute: boolean },
) {
  const state = useAppStore.getState();
  const nextAgentId = await agentRuntime.service.createAgent(input);

  if (input.projectId) {
    state.selectProject(input.projectId);
  }

  if (options.openRoute) {
    state.setRoute('agent');
  }

  return nextAgentId;
}

export function openAgent(agentId: string) {
  const state = useAppStore.getState();
  const agent = state.agents.find((item) => item.id === agentId) ?? null;

  if (agent?.projectId) {
    state.selectProject(agent.projectId);
    state.selectProjectView('agents');
  }

  agentRuntime.service.selectAgent(agentId);
  state.setRoute('agent');
}

export function openAgents() {
  openProjectView('agents');
}

export function cycleAgent(direction: -1 | 1) {
  const state = useAppStore.getState();
  const scopedAgentIds = state.agents
    .filter((agent) =>
      state.selectedProjectId
        ? agent.projectId === state.selectedProjectId
        : true,
    )
    .map((agent) => agent.id);
  const nextAgentId = getAgentByOffset(
    scopedAgentIds,
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

export function openPlugins() {
  const state = useAppStore.getState();

  state.setCommandOpen(false);
  state.setRoute('plugins');
}

export function openWorkflow() {
  openProjectView('board');
}

export function openItem(itemId: string) {
  const state = useAppStore.getState();

  state.selectItem(itemId);
  state.selectProjectView('board');
  state.setCommandOpen(false);
  state.setRoute('workflow');
}

export function openProjectActivity() {
  openProjectView('activity');
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
    createAgentWithOptions,
    cycleAgent,
    openAgent,
    openAgents,
    openItem,
    openPlugins,
    openProjectActivity,
    openSettings,
    openWorkflow,
    setCommandOpen,
    setDraft,
    setSettingsRoute,
    setThemePreference,
    toggleInspector,
  };
}
