// Settings section configuration.

import type { JSX } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  Bell,
  Bot,
  Flame,
  FolderKanban,
  Keyboard,
  Paintbrush,
  Waypoints,
} from 'lucide-react';

import { AppearanceSettings } from '@/renderer/features/settings/components/AppearanceSettings';
import { ArtifactsSettings } from '@/renderer/features/settings/components/ArtifactsSettings';
import { ModelsSettings } from '@/renderer/features/settings/components/ModelsSettings';
import { NuclearSettings } from '@/renderer/features/settings/components/NuclearSettings';
import { NetworkSettings } from '@/renderer/features/settings/components/NetworkSettings';
import { ShortcutsSettings } from '@/renderer/features/settings/components/ShortcutsSettings';
import { NotificationsSettingsPanel } from '@/renderer/features/settings/notifications';

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

/** Settings section component props. */
export interface SettingsSectionComponentProps {
  agents: Agent[];
  externalChannels: ExternalChannelsState;
  onThemeChange: (preference: ThemePreference) => void;
  runtimeInfo: AgentRuntimeInfo;
  themePreference: ThemePreference;
}

/** Settings section definition shape. */
interface SettingsSectionDefinition extends SettingsSection {
  Component: (props: SettingsSectionComponentProps) => JSX.Element;
  icon: LucideIcon;
}

/** Lists settings sections. */
export const settingsSections: SettingsSectionDefinition[] = [
  {
    id: 'appearance',
    title: 'Appearance',
    description: 'Theme and visual tone',
    Component: AppearanceSettings,
    icon: Paintbrush,
  },
  {
    id: 'models',
    title: 'Models',
    description: 'LLM provider catalog',
    Component: ModelsSettings,
    icon: Bot,
  },
  {
    id: 'network',
    title: 'Network',
    description: 'Proxy and transport path',
    Component: NetworkSettings,
    icon: Waypoints,
  },
  {
    id: 'artifacts',
    title: 'Artifacts',
    description: 'Agent templates and prompts',
    Component: ArtifactsSettings,
    icon: FolderKanban,
  },
  {
    id: 'notifications',
    title: 'Notifications',
    description: 'Alerts, delivery, and quiet hours',
    Component: NotificationsSettingsPanel,
    icon: Bell,
  },
  {
    id: 'shortcuts',
    title: 'Shortcuts',
    description: 'Keyboard-first reference',
    Component: ShortcutsSettings,
    icon: Keyboard,
  },
  {
    id: 'nuclear',
    title: 'Nuclear',
    description: 'Delete local data',
    Component: NuclearSettings,
    icon: Flame,
  },
];

/** Settings section registry constant. */
export const settingsSectionRegistry = Object.fromEntries(
  settingsSections.map((section) => [section.id, section]),
) as Record<SettingsRoute, SettingsSectionDefinition>;
