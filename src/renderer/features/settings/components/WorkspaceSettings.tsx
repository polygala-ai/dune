import type { SettingsSectionComponentProps } from '@/renderer/features/settings/config/settings-sections';
import type { SettingsRow } from '@/renderer/features/settings/types';
import { useDesktopPlatform } from '@/renderer/shared/lib/use-desktop-platform';

import { SettingsRows } from './SettingsRows';
import { SettingsSectionIntro } from './SettingsSectionIntro';

export function WorkspaceSettings(props: SettingsSectionComponentProps) {
  void props;
  const { modifierLabel } = useDesktopPlatform();
  const rows: SettingsRow[] = [
    {
      label: 'Default workspace',
      description: 'The app opens into an empty agent shell.',
      value: 'Empty',
    },
    {
      label: 'Launch layout',
      description: 'Sidebar plus transcript by default.',
      value: 'Two-pane',
    },
    {
      label: 'Context panel',
      description: `Use ${modifierLabel}\\ to open the inspector on demand.`,
      value: 'Hidden',
    },
  ];

  return (
    <>
      <SettingsSectionIntro
        description="These rows describe the default agent shell without implying runtime persistence yet."
        eyebrow="Workspace"
        title="Prototype defaults"
      />

      <SettingsRows rows={rows} />
    </>
  );
}
