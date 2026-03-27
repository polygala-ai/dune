import type { JSX } from 'react';

import { AppearanceSettings } from '@/renderer/features/settings/components/AppearanceSettings';
import { ChannelsSettings } from '@/renderer/features/settings/components/ChannelsSettings';
import { ModelsSettings } from '@/renderer/features/settings/components/ModelsSettings';
import { ShortcutsSettings } from '@/renderer/features/settings/components/ShortcutsSettings';

import type {
  SettingsRoute,
  SettingsSection,
  ThemePreference,
} from '@/renderer/features/settings/types';
import type { AgentRuntimeInfo } from '@/renderer/features/agents/types';

export interface SettingsSectionComponentProps {
  onThemeChange: (preference: ThemePreference) => void;
  runtimeInfo: AgentRuntimeInfo;
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
    id: 'channels',
    title: 'Channels',
    description: 'External channel catalog',
    Component: ChannelsSettings,
  },
  {
    id: 'models',
    title: 'Models',
    description: 'LLM provider catalog',
    Component: ModelsSettings,
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
