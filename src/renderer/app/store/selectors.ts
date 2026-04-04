import { useShallow } from 'zustand/react/shallow';

import { useAppStore } from '@/renderer/app/store/use-app-store';
import {
  presentAgent,
  presentAgentSummary,
  selectAgentById,
} from '@/renderer/features/agents/model/agent-presenters';
import {
  getProjectAgents,
  getProjectItems,
  presentWorkflowEventTimestamp,
  presentWorkflowItemSummary,
  selectWorkflowItemById,
  selectWorkflowProjectById,
} from '@/renderer/features/workflow/model/workflow-presenters';

export function useAgentSession() {
  const {
    agents,
    draft,
    externalChannels,
    isStreaming,
    runtimeInfo,
    selectedAgentId,
  } = useAppStore(
    useShallow((state) => ({
      agents: state.agents,
      draft: state.draft,
      externalChannels: state.externalChannels,
      isStreaming: state.isStreaming,
      runtimeInfo: state.runtimeInfo,
      selectedAgentId: state.selectedAgentId,
    })),
  );

  const activeAgent = selectAgentById(
    agents,
    selectedAgentId,
  );

  return {
    activeAgent: activeAgent
      ? presentAgent(activeAgent)
      : null,
    commandAgents: agents.map((agent) => ({
      ...presentAgentSummary(agent),
      projectId: agent.projectId ?? null,
      workspace: agent.workspace,
    })),
    draft,
    externalChannels,
    isStreaming,
    runtimeInfo,
    selectedAgentId,
  };
}

export function useShellState() {
  return useAppStore(
    useShallow((state) => ({
      isCommandOpen: state.isCommandOpen,
      isContextPanelOpen: state.isContextPanelOpen,
      route: state.route,
    })),
  );
}

export function useWorkflowSession() {
  const {
    agents,
    isWorkflowHydrated,
    items,
    projects,
    selectedItemId,
    selectedProjectFilter,
    selectedProjectId,
    selectedProjectScreen,
    selectedProjectView,
  } = useAppStore(
    useShallow((state) => ({
      agents: state.agents,
      isWorkflowHydrated: state.isWorkflowHydrated,
      items: state.items,
      projects: state.projects,
      selectedItemId: state.selectedItemId,
      selectedProjectFilter: state.selectedProjectFilter,
      selectedProjectId: state.selectedProjectId,
      selectedProjectScreen: state.selectedProjectScreen,
      selectedProjectView: state.selectedProjectView,
    })),
  );
  const selectedProject = selectWorkflowProjectById(projects, selectedProjectId);
  const projectItems = getProjectItems(
    items,
    selectedProject?.id ?? selectedProjectId,
  );
  const selectedItem = selectWorkflowItemById(
    projectItems,
    selectedItemId,
  );
  const projectAgents = getProjectAgents(
    agents,
    selectedProject?.id ?? selectedProjectId,
  );
  const agentsById = new Map(agents.map((agent) => [agent.id, agent] as const));
  const filteredItems = projectItems.filter((item) => {
    switch (selectedProjectFilter) {
      case 'assigned':
        return Boolean(item.primaryAgentId);
      case 'blocked':
        return item.tasks.some((task) => task.status === 'blocked');
      case 'review':
        return item.status === 'review';
      default:
        return true;
    }
  });
  const projectItemsByAgent = new Map(
    projectItems
      .filter((item) => item.primaryAgentId)
      .map((item) => [item.primaryAgentId!, item] as const),
  );
  const sortedProjectItemsByUpdated = [...projectItems].sort((left, right) => right.updatedAt - left.updatedAt);

  return {
    activityEntries: projectItems
      .flatMap((item) =>
        item.workflowEvents.map((event) => ({
          createdAt: event.createdAt,
          createdAtLabel: presentWorkflowEventTimestamp(event.createdAt),
          description: event.description,
          id: event.id,
          itemId: item.id,
          itemTitle: item.title,
        })),
      )
      .sort((left, right) => right.createdAt - left.createdAt),
    filteredItemSummaries: filteredItems.map((item) =>
      presentWorkflowItemSummary(item, agentsById),
    ),
    isWorkflowHydrated,
    items: projectItems,
    metrics: {
      activeCount: projectItems.filter((item) => item.status === 'active').length,
      agentCount: projectAgents.length,
      blockedCount: projectItems.filter((item) =>
        item.tasks.some((task) => task.status === 'blocked'),
      ).length,
      reviewCount: projectItems.filter((item) => item.status === 'review').length,
    },
    projectAgents: projectAgents
      .map((agent) => {
        const currentItem = projectItemsByAgent.get(agent.id) ?? null;

        return {
          ...presentAgentSummary(agent),
          currentItemId: currentItem?.id ?? null,
          currentItemTitle: currentItem?.title ?? null,
          projectId: agent.projectId ?? null,
        };
      })
      .sort((left, right) => left.name.localeCompare(right.name)),
    projects,
    recentItems: sortedProjectItemsByUpdated.slice(0, 4).map((item) => ({
      id: item.id,
      specialStateLabel: presentWorkflowItemSummary(item, agentsById).specialStateLabel,
      title: item.title,
      updatedLabel: presentWorkflowItemSummary(item, agentsById).updatedLabel,
    })),
    selectedItem: selectedItem
      ? {
          ...selectedItem,
          primaryAgentName: selectedItem.primaryAgentId
            ? agentsById.get(selectedItem.primaryAgentId)?.name ?? null
            : null,
          workProducts: selectedItem.workProducts.map((product) => ({
            ...product,
            createdAtLabel: presentWorkflowEventTimestamp(product.createdAt),
          })),
          workflowEvents: selectedItem.workflowEvents.map((event) => ({
            ...event,
            createdAtLabel: presentWorkflowEventTimestamp(event.createdAt),
          })),
        }
      : null,
    selectedItemId,
    selectedProject,
    selectedProjectFilter,
    selectedProjectId,
    selectedProjectScreen,
    selectedProjectView,
  };
}

export function useSettingsState() {
  return useAppStore(
    useShallow((state) => ({
      agents: state.agents,
      externalChannels: state.externalChannels,
      runtimeInfo: state.runtimeInfo,
      settingsRoute: state.settingsRoute,
      themePreference: state.themePreference,
    })),
  );
}
