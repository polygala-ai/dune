import { beforeEach, describe, expect, it } from 'vitest';

import {
  createAgent,
  cycleAgent,
  openAgent,
  openSettings,
  toggleInspector,
} from '@/renderer/app/store/app-commands';
import {
  resetAppStore,
  useAppStore,
} from '@/renderer/app/store/use-app-store';

describe('app commands', () => {
  beforeEach(() => {
    resetAppStore();
  });

  it('creates a new agent and selects it', async () => {
    const nextAgentId = await createAgent({
      channelId: 'dune-chat',
      name: 'Release coordinator',
    });
    const state = useAppStore.getState();

    expect(state.selectedAgentId).toBe(nextAgentId);
    expect(state.route).toBe('agent');
    expect(state.agents[0]?.id).toBe(nextAgentId);
  });

  it('opens settings and keeps command menu closed', () => {
    useAppStore.getState().setCommandOpen(true);

    openSettings();

    const state = useAppStore.getState();
    expect(state.route).toBe('settings');
    expect(state.isCommandOpen).toBe(false);
  });

  it('selects an opened agent', async () => {
    await createAgent({ channelId: 'dune-chat', name: 'Alpha' });
    const secondAgentId = await createAgent({
      channelId: 'dune-chat',
      name: 'Beta',
    });

    openAgent(secondAgentId);

    const state = useAppStore.getState();
    expect(state.selectedAgentId).toBe(secondAgentId);
  });

  it('cycles through the current agent list', async () => {
    await createAgent({ channelId: 'dune-chat', name: 'Alpha' });
    await createAgent({ channelId: 'dune-chat', name: 'Beta' });
    const stateBefore = useAppStore.getState();
    const initialAgentId = stateBefore.selectedAgentId;

    cycleAgent(1);

    const stateAfter = useAppStore.getState();
    expect(stateAfter.selectedAgentId).not.toBe(initialAgentId);
  });

  it('toggles the inspector visibility', () => {
    toggleInspector(true);
    expect(useAppStore.getState().isContextPanelOpen).toBe(true);

    toggleInspector();
    expect(useAppStore.getState().isContextPanelOpen).toBe(false);
  });
});
