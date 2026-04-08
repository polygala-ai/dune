import type { JSX } from 'react';

import { AppearanceSettings } from '@/renderer/features/settings/components/AppearanceSettings';
import { ModelsSettings } from '@/renderer/features/settings/components/ModelsSettings';
import { NetworkSettings } from '@/renderer/features/settings/components/NetworkSettings';
import { ShortcutsSettings } from '@/renderer/features/settings/components/ShortcutsSettings';

import type {
  SettingsRoute,
  SettingsSection,
  ThemePreference,
} from '@/renderer/features/settings/types';
import type {
  Agent,
  AgentRuntimeInfo,
  ExternalChannelsState,
} from '@/renderer/features/agents/types';

export interface SettingsSectionComponentProps {
  agents: Agent[];
  externalChannels: ExternalChannelsState;
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
    id: 'network',
    title: 'Network',
    description: 'Proxy and transport path',
    Component: NetworkSettings,
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
