// Shell slice store logic.

import type {
  AppStoreSlice,
  ShellSlice,
  ShellState,
} from './types';

/** Creates initial shell state. */
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

/** Creates shell slice. */
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
