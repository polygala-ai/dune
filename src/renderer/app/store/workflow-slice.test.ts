import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { useWorkflowSession } from '@/renderer/app/store/selectors';
import { createSeedWorkflowSnapshot } from '@/renderer/features/workflow/model/workflow-seed';
import { resetAppStore, useAppStore } from '@/renderer/app/store/use-app-store';
import { agentRuntime } from '@/renderer/features/agents/runtime/agent-runtime';

describe('workflow slice', () => {
  beforeEach(() => {
    resetAppStore();
    useAppStore.getState().hydrateWorkflow(createSeedWorkflowSnapshot(1_700_000_000_000));
  });

  it('creates projects and work items while keeping workflow selection in sync', () => {
    const state = useAppStore.getState();
    const nextProjectId = state.createProject({
      description: 'Support the next project pass for the docs team.',
      name: 'Docs Ops',
    });

    expect(nextProjectId).toBeTruthy();
    expect(useAppStore.getState().selectedProjectId).toBe(nextProjectId);

    const nextItemId = useAppStore.getState().createItem({
      brief: 'Review the first-run board language.',
      projectId: nextProjectId!,
      status: 'inbox',
      title: 'Tighten the launch copy',
    });

    expect(nextItemId).toBeTruthy();
    expect(useAppStore.getState().selectedItemId).toBe(nextItemId);
    expect(
      useAppStore.getState().projects.find((project) => project.id === nextProjectId)?.color,
    ).toBeTruthy();
    expect(
      useAppStore.getState().items.find((item) => item.id === nextItemId),
    ).toMatchObject({
      projectId: nextProjectId,
      status: 'inbox',
      title: 'Tighten the launch copy',
    });
  });

  it('moves work items, updates tasks, and assigns primary agents', () => {
    const state = useAppStore.getState();
    const itemId = state.items[0]?.id;

    if (!itemId) {
      throw new Error('Expected seeded workflow to include at least one work item.');
    }

    state.moveItem(itemId, 'review', 0);
    const movedItem = useAppStore.getState().items.find((item) => item.id === itemId);

    expect(movedItem?.status).toBe('review');

    const taskId = useAppStore.getState().addTask(itemId, 'Review the board rhythm');

    expect(taskId).toBeTruthy();

    useAppStore.getState().updateTask(itemId, taskId!, {
      status: 'doing',
    });
    useAppStore.getState().assignPrimaryAgent(itemId, {
      agentId: 'agent-writer-1',
      agentName: 'Writer agent',
    });

    const nextItem = useAppStore.getState().items.find((item) => item.id === itemId);

    expect(nextItem?.tasks.find((task) => task.id === taskId)?.status).toBe('doing');
    expect(nextItem?.primaryAgentId).toBe('agent-writer-1');
    expect(nextItem?.workflowEvents[0]?.description).toMatch(/primary agent/i);
  });

  it('keeps primary-agent ownership exclusive across work items', async () => {
    const state = useAppStore.getState();
    const projectId = state.selectedProjectId;
    const firstItemId = state.items[0]?.id;
    const secondItemId = state.items[1]?.id;

    if (!projectId || !firstItemId || !secondItemId) {
      throw new Error('Expected seeded workflow to include one project and two work items.');
    }

    const agentId = await agentRuntime.service.createAgent({
      channelId: 'dune-chat',
      name: 'Writer agent',
      projectId,
    });
    const { result } = renderHook(() => useWorkflowSession());

    useAppStore.getState().assignPrimaryAgent(firstItemId, {
      agentId,
      agentName: 'Writer agent',
    });
    useAppStore.getState().assignPrimaryAgent(secondItemId, {
      agentId,
      agentName: 'Writer agent',
    });

    const nextFirstItem = useAppStore.getState().items.find((item) => item.id === firstItemId);
    const nextSecondItem = useAppStore.getState().items.find((item) => item.id === secondItemId);

    expect(nextFirstItem?.primaryAgentId).toBeNull();
    expect(nextFirstItem?.workflowEvents[0]?.description).toBe('Primary agent cleared.');
    expect(nextSecondItem?.primaryAgentId).toBe(agentId);
    expect(nextSecondItem?.workflowEvents[0]?.description).toMatch(/primary agent set/i);
    expect(
      useAppStore.getState().items.filter((item) => item.primaryAgentId === agentId),
    ).toHaveLength(1);

    await waitFor(() => {
      expect(
        result.current.projectAgents.find((agent) => agent.id === agentId)?.currentItemId,
      ).toBe(secondItemId);
    });
  });

  it('updates project metadata and cascades project deletion through items and agents', async () => {
    const state = useAppStore.getState();
    const firstProjectId = state.projects[0]?.id;
    const secondProjectId = state.createProject({
      description: 'Coordinate the follow-up workflow pass.',
      name: 'Studio Ops',
    });

    if (!firstProjectId || !secondProjectId) {
      throw new Error('Expected seeded and created projects.');
    }

    const secondItemId = useAppStore.getState().createItem({
      brief: 'Keep only this project after delete.',
      projectId: secondProjectId,
      status: 'ready',
      title: 'Refine project shell',
    });

    await agentRuntime.service.createAgent({
      channelId: 'dune-chat',
      name: 'Studio agent',
      projectId: secondProjectId,
    });

    useAppStore.getState().updateProject(secondProjectId, {
      description: 'Coordinate the calmer shell pass.',
      name: 'Studio Systems',
    });

    expect(
      useAppStore.getState().projects.find((project) => project.id === secondProjectId),
    ).toMatchObject({
      description: 'Coordinate the calmer shell pass.',
      name: 'Studio Systems',
    });

    useAppStore.getState().setRoute('agent');
    useAppStore.getState().deleteProject(secondProjectId);

    expect(
      useAppStore.getState().projects.some((project) => project.id === secondProjectId),
    ).toBe(false);
    expect(
      useAppStore.getState().items.some((item) => item.id === secondItemId),
    ).toBe(false);
    expect(
      useAppStore.getState().agents.some((agent) => agent.projectId === secondProjectId),
    ).toBe(false);
    expect(useAppStore.getState().selectedProjectId).toBe(firstProjectId);
    expect(useAppStore.getState().route).toBe('workflow');
  });

  it('allows deleting the last remaining project and falls back to an empty project shell', () => {
    const state = useAppStore.getState();

    for (const project of [...state.projects].slice(1)) {
      state.deleteProject(project.id);
    }

    const lastProjectId = useAppStore.getState().projects[0]?.id;

    if (!lastProjectId) {
      throw new Error('Expected one remaining project.');
    }

    useAppStore.getState().deleteProject(lastProjectId);

    expect(useAppStore.getState().projects).toEqual([]);
    expect(useAppStore.getState().items).toEqual([]);
    expect(useAppStore.getState().selectedProjectId).toBeNull();
    expect(useAppStore.getState().selectedItemId).toBeNull();
    expect(useAppStore.getState().selectedProjectScreen).toBe('main');
  });
});
