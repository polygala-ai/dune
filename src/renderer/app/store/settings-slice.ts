// Settings slice store logic.

import type {
  AppStoreSlice,
  SettingsSlice,
  SettingsState,
} from './types';

/** Creates initial settings state. */
export function createInitialSettingsState(): SettingsState {
  return {
    settingsRoute: 'appearance',
    themePreference: 'system',
  };
}

/** Creates settings slice. */
export function createSettingsSlice(
  initialState: SettingsState,
): AppStoreSlice<SettingsSlice> {
  return (set) => ({
    ...initialState,
    setSettingsRoute: (settingsRoute) => {
      set({ settingsRoute });
    },
    setThemePreference: (themePreference) => {
      set({ themePreference });
    },
  });
}
