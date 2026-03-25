import type { JSX } from 'react';

import { AppearanceSettings } from '@/renderer/features/settings/components/AppearanceSettings';
import { ShortcutsSettings } from '@/renderer/features/settings/components/ShortcutsSettings';
import { WorkspaceSettings } from '@/renderer/features/settings/components/WorkspaceSettings';

import type {
  SettingsRoute,
  SettingsSection,
  ThemePreference,
} from '@/renderer/features/settings/types';

export interface SettingsSectionComponentProps {
  onThemeChange: (preference: ThemePreference) => void;
  themePreference: ThemePreference;
}

interface SettingsSectionDefinition extends SettingsSection {
  Component: (props: SettingsSectionComponentProps) => JSX.Element;
}

export const settingsSections: SettingsSectionDefinition[] = [
  {
    id: 'appearance',
    title: 'Appearance',
    description: 'Theme and visual tone',
    Component: AppearanceSettings,
  },
  {
    id: 'workspace',
    title: 'Workspace',
    description: 'Layout defaults and demo scope',
    Component: WorkspaceSettings,
  },
  {
    id: 'shortcuts',
    title: 'Shortcuts',
    description: 'Keyboard-first reference',
    Component: ShortcutsSettings,
  },
];

export const settingsSectionRegistry = Object.fromEntries(
  settingsSections.map((section) => [section.id, section]),
) as Record<SettingsRoute, SettingsSectionDefinition>;
