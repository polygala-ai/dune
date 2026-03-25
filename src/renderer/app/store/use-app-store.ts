import { create } from 'zustand';

import {
  createChatSlice,
  createInitialChatState,
} from '@/renderer/app/store/chat-slice';
import {
  createInitialSettingsState,
  createSettingsSlice,
} from '@/renderer/app/store/settings-slice';
import {
  createInitialShellState,
  createShellSlice,
} from '@/renderer/app/store/shell-slice';

import type {
  AppStore,
  AppStoreState,
} from './types';

function createInitialState(): AppStoreState {
  const chatState = createInitialChatState();
  const [firstConversation] = chatState.conversations;

  if (!firstConversation) {
    throw new Error('Expected the seeded chat state to include at least one conversation.');
  }

  return {
    ...chatState,
    ...createInitialShellState(firstConversation.id),
    ...createInitialSettingsState(),
  };
}

export const useAppStore = create<AppStore>((set, get, store) => {
  const initialState = createInitialState();

  return {
    ...createChatSlice({
      conversations: initialState.conversations,
      draft: initialState.draft,
      isStreaming: initialState.isStreaming,
    })(set, get, store),
    ...createShellSlice({
      isCommandOpen: initialState.isCommandOpen,
      isContextPanelOpen: initialState.isContextPanelOpen,
      route: initialState.route,
      selectedConversationId: initialState.selectedConversationId,
    })(set, get, store),
    ...createSettingsSlice({
      settingsRoute: initialState.settingsRoute,
      themePreference: initialState.themePreference,
    })(set, get, store),
  };
});

export function resetAppStore() {
  useAppStore.setState(createInitialState());
}
