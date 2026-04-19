// Settings section configuration.

import type { JSX } from 'react';

import { AppearanceSettings } from '@/renderer/features/settings/components/AppearanceSettings';
import { ArtifactsSettings } from '@/renderer/features/settings/components/ArtifactsSettings';
import { CodingEngineSettings } from '@/renderer/features/settings/components/CodingEngineSettings';
import { ModelsSettings } from '@/renderer/features/settings/components/ModelsSettings';
import { NuclearSettings } from '@/renderer/features/settings/components/NuclearSettings';
import { NetworkSettings } from '@/renderer/features/settings/components/NetworkSettings';
import { ShortcutsSettings } from '@/renderer/features/settings/components/ShortcutsSettings';

import type {
  SettingsRoute,
  SettingsSection,
  ThemePreference,
} from '@/renderer/features/settings/types';
import type {
  Agent,
  CodingEngineStatus,
  AgentRuntimeInfo,
  ExternalChannelsState,
} from '@/renderer/features/agents/types';

/** Settings section component props. */
export interface SettingsSectionComponentProps {
  agents: Agent[];
  codingEngines: CodingEngineStatus[];
  externalChannels: ExternalChannelsState;
  onThemeChange: (preference: ThemePreference) => void;
  runtimeInfo: AgentRuntimeInfo;
  themePreference: ThemePreference;
}

/** Settings section definition shape. */
interface SettingsSectionDefinition extends SettingsSection {
  Component: (props: SettingsSectionComponentProps) => JSX.Element;
}

/** Lists settings sections. */
export const settingsSections: SettingsSectionDefinition[] = [
  {
    id: 'appearance',
    title: 'Appearance',
    description: 'Theme and visual tone',
    Component: AppearanceSettings,
  },
  {
    id: 'models',
    title: 'Models',
    description: 'LLM provider catalog',
    Component: ModelsSettings,
  },
  {
    id: 'coding-engine',
    title: 'Coding Engine',
    description: 'ACP delegation control',
    Component: CodingEngineSettings,
  },
  {
    id: 'network',
    title: 'Network',
    description: 'Proxy and transport path',
    Component: NetworkSettings,
  },
  {
    id: 'artifacts',
    title: 'Artifacts',
    description: 'Agent templates and prompts',
    Component: ArtifactsSettings,
  },
  {
    id: 'shortcuts',
    title: 'Shortcuts',
    description: 'Keyboard-first reference',
    Component: ShortcutsSettings,
  },
  {
    id: 'nuclear',
    title: 'Nuclear',
    description: 'Delete local data',
    Component: NuclearSettings,
  },
];

/** Settings section registry constant. */
export const settingsSectionRegistry = Object.fromEntries(
  settingsSections.map((section) => [section.id, section]),
) as Record<SettingsRoute, SettingsSectionDefinition>;
