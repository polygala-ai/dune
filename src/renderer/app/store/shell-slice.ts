import type {
  AppStoreSlice,
  ShellSlice,
  ShellState,
} from './types';

export function createInitialShellState(): ShellState {
  return {
    isCommandOpen: false,
    isContextPanelOpen: false,
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
    setRoute: (route) => {
      set({ route });
    },
  });
}
