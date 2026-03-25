import type {
  AppStoreSlice,
  SettingsSlice,
  SettingsState,
} from './types';

export function createInitialSettingsState(): SettingsState {
  return {
    settingsRoute: 'appearance',
    themePreference: 'system',
  };
}

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
