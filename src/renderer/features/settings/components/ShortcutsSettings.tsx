// Shortcuts settings UI.

import type { SettingsSectionComponentProps } from '@/renderer/features/settings/config/settings-sections';
import type { SettingsRow } from '@/renderer/features/settings/types';
import { useDesktopPlatform } from '@/renderer/shared/lib/use-desktop-platform';

import { SettingsRows } from './SettingsRows';
import { SettingsSectionIntro } from './SettingsSectionIntro';

/** Renders the shortcuts settings UI. */
export function ShortcutsSettings(props: SettingsSectionComponentProps) {
  void props;
  const {
    isMac,
    modifierLabel,
  } = useDesktopPlatform();
  const mappingDescription = isMac
    ? 'macOS-first mapping'
    : 'Cross-platform mapping';
  const rows: SettingsRow[] = [
    {
      label: 'Quick switch',
      description: mappingDescription,
      value: `${modifierLabel}K`,
    },
    {
      label: 'New agent',
      description: mappingDescription,
      value: `${modifierLabel}N`,
    },
    {
      label: 'Settings',
      description: mappingDescription,
      value: `${modifierLabel},`,
    },
    {
      label: 'Toggle context panel',
      description: mappingDescription,
      value: `${modifierLabel}\\`,
    },
    {
      label: 'Send message',
      description: mappingDescription,
      value: `${modifierLabel} Enter`,
    },
    {
      label: 'Agent up/down',
      description: mappingDescription,
      value: '↑ / ↓',
    },
    {
      label: 'Close overlays',
      description: mappingDescription,
      value: 'Esc',
    },
  ];

  return (
    <>
      <SettingsSectionIntro
        description="The shell still assumes you move mostly from the keyboard."
        eyebrow="Shortcuts"
        title="Keyboard-first reference"
      />

      <SettingsRows rows={rows} />
    </>
  );
}
