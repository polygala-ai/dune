import { useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { useAppStore } from '@/renderer/app/store/use-app-store';
import { createSeedWorkflowSnapshot } from '@/renderer/features/workflow/model/workflow-seed';
import {
  workflowItemStatuses,
  workflowProjectFilters,
  workflowProjectViews,
  workflowTaskStatuses,
  type WorkflowEvent,
  type WorkflowSnapshot,
  type WorkflowTask,
  type WorkflowWorkProduct,
} from '@/renderer/features/workflow/types';

const STORE_NAME = 'workflow';
const STORE_KEY = 'snapshot';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizeTask(value: unknown): WorkflowTask | null {
  if (!isRecord(value)) {
    return null;
  }

  if (
    typeof value.id !== 'string' ||
    typeof value.title !== 'string' ||
    typeof value.notes !== 'string' ||
    typeof value.createdAt !== 'number' ||
    typeof value.updatedAt !== 'number' ||
    !workflowTaskStatuses.includes(value.status as (typeof workflowTaskStatuses)[number])
  ) {
    return null;
  }

  return {
    createdAt: value.createdAt,
    id: value.id,
    notes: value.notes,
    status: value.status as WorkflowTask['status'],
    title: value.title,
    updatedAt: value.updatedAt,
  };
}

function normalizeWorkProduct(value: unknown): WorkflowWorkProduct | null {
  if (!isRecord(value)) {
    return null;
  }

  if (
    typeof value.id !== 'string' ||
    typeof value.title !== 'string' ||
    typeof value.body !== 'string' ||
    typeof value.createdAt !== 'number'
  ) {
    return null;
  }

  return {
    body: value.body,
    createdAt: value.createdAt,
    id: value.id,
    title: value.title,
  };
}

function normalizeEvent(value: unknown): WorkflowEvent | null {
  if (!isRecord(value)) {
    return null;
  }

  if (
    typeof value.id !== 'string' ||
    typeof value.description !== 'string' ||
    typeof value.createdAt !== 'number'
  ) {
    return null;
  }

  const kind = value.kind === 'assignment'
    ? 'assignment'
    : value.kind === 'task'
      ? 'task'
      : value.kind === 'note'
        ? 'note'
        : 'item';

  return {
    createdAt: value.createdAt,
    description: value.description,
    id: value.id,
    kind,
  };
}

function normalizeCurrentSnapshot(value: unknown): WorkflowSnapshot | null {
  if (!isRecord(value)) {
    return null;
  }

  if (!Array.isArray(value.projects) || !Array.isArray(value.items)) {
    return null;
  }

  const projects = value.projects.filter((project) => (
    isRecord(project) &&
    typeof project.id === 'string' &&
    typeof project.name === 'string' &&
    typeof project.description === 'string' &&
    typeof project.color === 'string' &&
    typeof project.createdAt === 'number' &&
    typeof project.updatedAt === 'number'
  ));

  if (projects.length !== value.projects.length) {
    return null;
  }

  const items = value.items.map((item) => {
    if (
      !isRecord(item) ||
      typeof item.id !== 'string' ||
      typeof item.projectId !== 'string' ||
      typeof item.title !== 'string' ||
      typeof item.brief !== 'string' ||
      typeof item.sortOrder !== 'number' ||
      typeof item.createdAt !== 'number' ||
      typeof item.updatedAt !== 'number' ||
      !workflowItemStatuses.includes(item.status as (typeof workflowItemStatuses)[number]) ||
      !Array.isArray(item.tasks) ||
      !Array.isArray(item.workProducts) ||
      !Array.isArray(item.workflowEvents)
    ) {
      return null;
    }

    const tasks = item.tasks.map(normalizeTask);
    const workProducts = item.workProducts.map(normalizeWorkProduct);
    const workflowEvents = item.workflowEvents.map(normalizeEvent);

    if (
      tasks.some((task) => task === null) ||
      workProducts.some((product) => product === null) ||
      workflowEvents.some((event) => event === null)
    ) {
      return null;
    }

    return {
      brief: item.brief,
      createdAt: item.createdAt,
      id: item.id,
      primaryAgentId:
        typeof item.primaryAgentId === 'string' || item.primaryAgentId === null
          ? item.primaryAgentId
          : null,
      projectId: item.projectId,
      sortOrder: item.sortOrder,
      status: item.status,
      tasks: tasks as WorkflowTask[],
      title: item.title,
      updatedAt: item.updatedAt,
      workProducts: workProducts as WorkflowWorkProduct[],
      workflowEvents: workflowEvents as WorkflowEvent[],
    };
  });

  if (items.some((item) => item === null)) {
    return null;
  }

  return {
    items: items as WorkflowSnapshot['items'],
    projects,
    selectedItemId:
      typeof value.selectedItemId === 'string' || value.selectedItemId === null
        ? value.selectedItemId
        : null,
    selectedProjectFilter: workflowProjectFilters.includes(
      value.selectedProjectFilter as (typeof workflowProjectFilters)[number],
    )
      ? (value.selectedProjectFilter as WorkflowSnapshot['selectedProjectFilter'])
      : 'all',
    selectedProjectId:
      typeof value.selectedProjectId === 'string' || value.selectedProjectId === null
        ? value.selectedProjectId
        : null,
    selectedProjectView: workflowProjectViews.includes(
      value.selectedProjectView as (typeof workflowProjectViews)[number],
    )
      ? (value.selectedProjectView as WorkflowSnapshot['selectedProjectView'])
      : 'board',
  };
}

function migrateLegacySnapshot(value: unknown): WorkflowSnapshot | null {
  if (!isRecord(value)) {
    return null;
  }

  if (!Array.isArray(value.projects) || !Array.isArray(value.missions)) {
    return null;
  }

  const projects = value.projects.filter((project) => (
    isRecord(project) &&
    typeof project.id === 'string' &&
    typeof project.name === 'string' &&
    typeof project.description === 'string' &&
    typeof project.color === 'string' &&
    typeof project.createdAt === 'number' &&
    typeof project.updatedAt === 'number'
  ));

  if (projects.length !== value.projects.length) {
    return null;
  }

  const items = value.missions.flatMap((mission) => {
    if (
      !isRecord(mission) ||
      typeof mission.id !== 'string' ||
      typeof mission.projectId !== 'string' ||
      typeof mission.title !== 'string' ||
      typeof mission.brief !== 'string' ||
      typeof mission.sortOrder !== 'number' ||
      typeof mission.createdAt !== 'number' ||
      typeof mission.updatedAt !== 'number' ||
      !Array.isArray(mission.tasks) ||
      !Array.isArray(mission.workProducts) ||
      !Array.isArray(mission.workflowEvents)
    ) {
      return [];
    }

    const tasks = mission.tasks.map(normalizeTask);
    const workProducts = mission.workProducts.map(normalizeWorkProduct);
    const workflowEvents = mission.workflowEvents.map((event) => {
      const normalized = normalizeEvent(event);

      if (!normalized) {
        return null;
      }

      return {
        ...normalized,
        kind: normalized.kind === 'item'
          ? 'item'
          : normalized.kind === 'assignment'
            ? 'assignment'
            : normalized.kind,
      };
    });

    if (
      tasks.some((task) => task === null) ||
      workProducts.some((product) => product === null) ||
      workflowEvents.some((event) => event === null)
    ) {
      return [];
    }

    const linkedAgents = Array.isArray(mission.linkedAgents)
      ? mission.linkedAgents.filter(isRecord)
      : [];
    const primaryAgentId = linkedAgents.find(
      (agent): agent is Record<string, string> => typeof agent.agentId === 'string',
    )?.agentId ?? null;
    const legacyStatus = mission.status === 'planned' ? 'ready' : mission.status;

    if (!workflowItemStatuses.includes(legacyStatus as (typeof workflowItemStatuses)[number])) {
      return [];
    }

    return [{
      brief: mission.brief,
      createdAt: mission.createdAt,
      id: mission.id,
      primaryAgentId,
      projectId: mission.projectId,
      sortOrder: mission.sortOrder,
      status: legacyStatus as WorkflowSnapshot['items'][number]['status'],
      tasks: tasks as WorkflowTask[],
      title: mission.title,
      updatedAt: mission.updatedAt,
      workProducts: workProducts as WorkflowWorkProduct[],
      workflowEvents: workflowEvents as WorkflowEvent[],
    }];
  });

  return {
    items,
    projects,
    selectedItemId:
      typeof value.selectedMissionId === 'string' || value.selectedMissionId === null
        ? value.selectedMissionId
        : null,
    selectedProjectFilter: 'all',
    selectedProjectId:
      typeof value.selectedProjectId === 'string' || value.selectedProjectId === null
        ? value.selectedProjectId
        : null,
    selectedProjectView: 'board',
  };
}

function normalizeWorkflowSnapshot(value: unknown): WorkflowSnapshot | null {
  return normalizeCurrentSnapshot(value) ?? migrateLegacySnapshot(value);
}

export function useWorkflowPersistence() {
  const hydrateWorkflow = useAppStore((state) => state.hydrateWorkflow);
  const {
    isWorkflowHydrated,
    items,
    projects,
    selectedItemId,
    selectedProjectFilter,
    selectedProjectId,
    selectedProjectView,
  } = useAppStore(
    useShallow((state) => ({
      isWorkflowHydrated: state.isWorkflowHydrated,
      items: state.items,
      projects: state.projects,
      selectedItemId: state.selectedItemId,
      selectedProjectFilter: state.selectedProjectFilter,
      selectedProjectId: state.selectedProjectId,
      selectedProjectView: state.selectedProjectView,
    })),
  );

  useEffect(() => {
    let isDisposed = false;

    const load = async () => {
      const rawSnapshot = await window.duneDesktop?.storageGet?.(STORE_NAME, STORE_KEY);
      const snapshot = normalizeWorkflowSnapshot(rawSnapshot)
        ?? createSeedWorkflowSnapshot();

      if (isDisposed) {
        return;
      }

      hydrateWorkflow(snapshot);

      if (!normalizeWorkflowSnapshot(rawSnapshot)) {
        await window.duneDesktop?.storageSet?.(STORE_NAME, STORE_KEY, snapshot);
      }
    };

    void load();

    return () => {
      isDisposed = true;
    };
  }, [hydrateWorkflow]);

  useEffect(() => {
    if (!isWorkflowHydrated) {
      return;
    }

    void window.duneDesktop?.storageSet?.(STORE_NAME, STORE_KEY, {
      items,
      projects,
      selectedItemId,
      selectedProjectFilter,
      selectedProjectId,
      selectedProjectView,
    } satisfies WorkflowSnapshot);
  }, [
    isWorkflowHydrated,
    items,
    projects,
    selectedItemId,
    selectedProjectFilter,
    selectedProjectId,
    selectedProjectView,
  ]);
}
