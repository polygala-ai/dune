import type {
  AppStoreSlice,
  ShellSlice,
  ShellState,
} from './types';

export function createInitialShellState(
  selectedConversationId: string,
): ShellState {
  return {
    isCommandOpen: false,
    isContextPanelOpen: false,
    route: 'chat',
    selectedConversationId,
  };
}

export function createShellSlice(initialState: ShellState): AppStoreSlice<ShellSlice> {
  return (set) => ({
    ...initialState,
    setCommandOpen: (isCommandOpen) => {
      set({ isCommandOpen });
    },
    setContextPanelOpen: (isContextPanelOpen) => {
      set({ isContextPanelOpen });
    },
    setRoute: (route) => {
      set({ route });
    },
    setSelectedConversationId: (selectedConversationId) => {
      set({
        selectedConversationId,
      });
    },
  });
}
