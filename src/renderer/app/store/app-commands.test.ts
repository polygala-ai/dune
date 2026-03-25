import { beforeEach, describe, expect, it } from 'vitest';

import {
  cycleConversation,
  openConversation,
  openSettings,
  startConversation,
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

  it('creates a new conversation and selects it', () => {
    const nextConversationId = startConversation();
    const state = useAppStore.getState();

    expect(state.selectedConversationId).toBe(nextConversationId);
    expect(state.route).toBe('chat');
    expect(state.conversations[0]?.id).toBe(nextConversationId);
  });

  it('opens settings and keeps command menu closed', () => {
    useAppStore.getState().setCommandOpen(true);

    openSettings();

    const state = useAppStore.getState();
    expect(state.route).toBe('settings');
    expect(state.isCommandOpen).toBe(false);
  });

  it('reorders and selects an opened conversation', () => {
    const secondConversationId = useAppStore.getState().conversations[1]?.id;

    if (!secondConversationId) {
      throw new Error('Expected a second seeded conversation.');
    }

    openConversation(secondConversationId);

    const state = useAppStore.getState();
    expect(state.selectedConversationId).toBe(secondConversationId);
    expect(state.conversations[0]?.id).toBe(secondConversationId);
  });

  it('cycles through the current conversation list', () => {
    const stateBefore = useAppStore.getState();
    const initialConversationId = stateBefore.selectedConversationId;

    cycleConversation(1);

    const stateAfter = useAppStore.getState();
    expect(stateAfter.selectedConversationId).not.toBe(initialConversationId);
  });

  it('toggles the inspector visibility', () => {
    toggleInspector(true);
    expect(useAppStore.getState().isContextPanelOpen).toBe(true);

    toggleInspector();
    expect(useAppStore.getState().isContextPanelOpen).toBe(false);
  });
});
