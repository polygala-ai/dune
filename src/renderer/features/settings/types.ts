// Settings feature types.

/** Settings route shape. */
export type SettingsRoute =
  | 'appearance'
  | 'artifacts'
  | 'models'
  | 'network'
  | 'shortcuts'
  | 'usage'
  | 'nuclear';
/** Theme preference shape. */
export type ThemePreference = 'dark' | 'light' | 'system';
export type {
  ModelAuthType,
  ModelProvider,
} from '@/renderer/features/settings/model/model-providers';

/** Settings section shape. */
export interface SettingsSection {
  id: SettingsRoute;
  description: string;
  title: string;
}

/** Settings row shape. */
export interface SettingsRow {
  description: string;
  label: string;
  value: string;
}
