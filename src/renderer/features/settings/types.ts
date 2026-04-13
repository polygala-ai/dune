export type SettingsRoute =
  | 'appearance'
  | 'artifacts'
  | 'models'
  | 'network'
  | 'shortcuts'
  | 'nuclear';
export type ThemePreference = 'dark' | 'light' | 'system';
export type {
  ModelAuthType,
  ModelProvider,
} from '@/renderer/features/settings/model/model-providers';

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
