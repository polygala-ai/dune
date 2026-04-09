import type { NavigationSnapshot } from '@/renderer/app/store/types';
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

function getNavigationSnapshot(): NavigationSnapshot {
  const state = useAppStore.getState();

  return {
    route: state.route,
    selectedAgentId: state.route === 'agent' ? state.selectedAgentId : null,
    selectedProjectId: state.selectedProjectId,
    selectedProjectScreen: state.selectedProjectScreen,
    selectedProjectView: state.selectedProjectView,
    settingsRoute: state.settingsRoute,
  };
}

function areNavigationSnapshotsEqual(
  left: NavigationSnapshot | undefined,
  right: NavigationSnapshot,
) {
  return !!left &&
    left.route === right.route &&
    left.selectedAgentId === right.selectedAgentId &&
    left.selectedProjectId === right.selectedProjectId &&
    left.selectedProjectScreen === right.selectedProjectScreen &&
    left.selectedProjectView === right.selectedProjectView &&
    left.settingsRoute === right.settingsRoute;
}

function commitNavigationState(
  previous: NavigationSnapshot,
  current: NavigationSnapshot,
) {
  if (areNavigationSnapshotsEqual(previous, current)) {
    return;
  }

  const state = useAppStore.getState();
  const currentTop = state.navigationBackStack[state.navigationBackStack.length - 1];
  const navigationBackStack = areNavigationSnapshotsEqual(currentTop, previous)
    ? state.navigationBackStack
    : [...state.navigationBackStack, previous];

  useAppStore.setState({
    navigationBackStack,
    navigationForwardStack: [],
  });
}

function withNavigationChange(run: () => void) {
  const previous = getNavigationSnapshot();

  run();

  commitNavigationState(previous, getNavigationSnapshot());
}

async function withNavigationChangeAsync(run: () => Promise<void>) {
  const previous = getNavigationSnapshot();

  await run();

  commitNavigationState(previous, getNavigationSnapshot());
}

function applyNavigationSnapshot(snapshot: NavigationSnapshot) {
  const state = useAppStore.getState();

  if (snapshot.selectedProjectId !== state.selectedProjectId) {
    state.selectProject(snapshot.selectedProjectId);
  }

  if (snapshot.selectedProjectScreen === 'settings') {
    state.openProjectSettings();
  } else {
    state.closeProjectSettings();
  }

  if (snapshot.selectedProjectView !== state.selectedProjectView) {
    state.selectProjectView(snapshot.selectedProjectView);
  }

  if (snapshot.settingsRoute !== state.settingsRoute) {
    state.setSettingsRoute(snapshot.settingsRoute);
  }

  if (snapshot.route === 'agent' && snapshot.selectedAgentId) {
    agentRuntime.service.selectAgent(snapshot.selectedAgentId);
  }

  state.setCommandOpen(false);
  state.setRoute(snapshot.route);
}

function openProjectView(view: WorkflowProjectView, projectId?: string | null) {
  withNavigationChange(() => {
    const state = useAppStore.getState();

    state.setCommandOpen(false);

    if (projectId !== undefined) {
      state.selectProject(projectId);
    }

    state.selectProjectView(view);
    state.setRoute('workflow');
  });
}

export async function createAgent(input: CreateAgentInput) {
  return createAgentWithOptions(input, { openRoute: true });
}

export async function createAgentWithOptions(
  input: CreateAgentInput,
  options: { openRoute: boolean },
) {
  let nextAgentId = '';

  await withNavigationChangeAsync(async () => {
    const state = useAppStore.getState();
    nextAgentId = await agentRuntime.service.createAgent(input);

    if (input.projectId) {
      state.selectProject(input.projectId);
    }

    if (options.openRoute) {
      state.setRoute('agent');
    }
  });

  return nextAgentId;
}

export function openAgent(agentId: string) {
  withNavigationChange(() => {
    const state = useAppStore.getState();
    const agent = state.agents.find((item) => item.id === agentId) ?? null;

    if (agent?.projectId) {
      state.selectProject(agent.projectId);
      state.selectProjectView('agents');
    }

    agentRuntime.service.selectAgent(agentId);
    state.setRoute('agent');
  });
}

export function openAgents(projectId?: string | null) {
  openProjectView('agents', projectId);
}

export function cycleAgent(direction: -1 | 1) {
  withNavigationChange(() => {
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
  });
}

export function openSettings() {
  withNavigationChange(() => {
    const state = useAppStore.getState();

    state.setCommandOpen(false);
    state.setRoute('settings');
  });
}

export function openPlugins() {
  withNavigationChange(() => {
    const state = useAppStore.getState();

    state.setCommandOpen(false);
    state.setRoute('plugins');
  });
}

export function openWorkflow(projectId?: string | null) {
  openProjectView('board', projectId);
}

export function openItem(itemId: string) {
  withNavigationChange(() => {
    const state = useAppStore.getState();

    state.selectItem(itemId);
    state.selectProjectView('board');
    state.setCommandOpen(false);
    state.setRoute('workflow');
  });
}

export function openProjectActivity(projectId?: string | null) {
  openProjectView('activity', projectId);
}

export function openProjectSettings() {
  withNavigationChange(() => {
    const state = useAppStore.getState();

    state.selectProjectView('board');
    state.openProjectSettings();
    state.setRoute('workflow');
  });
}

export function goBack() {
  const state = useAppStore.getState();
  const target = state.navigationBackStack[state.navigationBackStack.length - 1];

  if (!target) {
    return;
  }

  const current = getNavigationSnapshot();
  const currentTop = state.navigationForwardStack[state.navigationForwardStack.length - 1];

  useAppStore.setState({
    navigationBackStack: state.navigationBackStack.slice(0, -1),
    navigationForwardStack: areNavigationSnapshotsEqual(currentTop, current)
      ? state.navigationForwardStack
      : [...state.navigationForwardStack, current],
  });

  applyNavigationSnapshot(target);
}

export function goForward() {
  const state = useAppStore.getState();
  const target = state.navigationForwardStack[state.navigationForwardStack.length - 1];

  if (!target) {
    return;
  }

  const current = getNavigationSnapshot();
  const currentTop = state.navigationBackStack[state.navigationBackStack.length - 1];

  useAppStore.setState({
    navigationBackStack: areNavigationSnapshotsEqual(currentTop, current)
      ? state.navigationBackStack
      : [...state.navigationBackStack, current],
    navigationForwardStack: state.navigationForwardStack.slice(0, -1),
  });

  applyNavigationSnapshot(target);
}

export function setCommandOpen(isOpen: boolean) {
  useAppStore.getState().setCommandOpen(isOpen);
}

export function toggleInspector(force?: boolean) {
  const state = useAppStore.getState();

  state.setContextPanelOpen(typeof force === 'boolean' ? force : !state.isContextPanelOpen);
}

export function setDraft(draft: string) {
  const state = useAppStore.getState();

  state.setDraft(state.selectedAgentId, draft);
}

export function setSettingsRoute(route: SettingsRoute) {
  withNavigationChange(() => {
    const state = useAppStore.getState();

    state.setCommandOpen(false);
    state.setSettingsRoute(route);
    state.setRoute('settings');
  });
}

export function setThemePreference(preference: ThemePreference) {
  useAppStore.getState().setThemePreference(preference);
}

export function useAppCommands() {
  return {
    createAgent,
    createAgentWithOptions,
    cycleAgent,
    goBack,
    goForward,
    openAgent,
    openAgents,
    openItem,
    openPlugins,
    openProjectActivity,
    openProjectSettings,
    openSettings,
    openWorkflow,
    setCommandOpen,
    setDraft,
    setSettingsRoute,
    setThemePreference,
    toggleInspector,
  };
}
