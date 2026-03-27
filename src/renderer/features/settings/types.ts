export type SettingsRoute = 'appearance' | 'channels' | 'models' | 'shortcuts';
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

export interface ModelProvider {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  enabled: boolean;
}
