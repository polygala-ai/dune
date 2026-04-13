import type {
  AppStoreSlice,
  ShellSlice,
  ShellState,
} from './types';

export function createInitialShellState(): ShellState {
  return {
    isCommandOpen: false,
    isContextPanelOpen: false,
    navigationBackStack: [],
    navigationForwardStack: [],
    popoverAgentId: null,
    route: 'workflow',
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
    setPopoverAgentId: (popoverAgentId) => {
      set({ popoverAgentId });
    },
    setRoute: (route) => {
      set({ route });
    },
  });
}
