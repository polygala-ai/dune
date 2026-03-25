export type SettingsRoute = 'appearance' | 'shortcuts' | 'workspace';
export type ThemePreference = 'dark' | 'light' | 'system';

export interface SettingsSection {
  id: SettingsRoute;
  description: string;
  title: string;
}

export interface SettingsRow {
  description: string;
  label: string;
  value: string;
}
