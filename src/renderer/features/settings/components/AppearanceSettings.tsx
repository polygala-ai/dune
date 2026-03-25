import type { LucideIcon } from 'lucide-react';
import { Laptop, MoonStar, SunMedium } from 'lucide-react';

import type { SettingsRow } from '@/renderer/features/settings/types';
import { cn } from '@/renderer/shared/lib/utils';
import type { SettingsSectionComponentProps } from '@/renderer/features/settings/config/settings-sections';

import { SettingsRows } from './SettingsRows';
import { SettingsSectionIntro } from './SettingsSectionIntro';

interface ThemeOption {
  icon: LucideIcon;
  id: SettingsSectionComponentProps['themePreference'];
  label: string;
}

const themeOptions: ThemeOption[] = [
  {
    id: 'system',
    icon: Laptop,
    label: 'System',
  },
  {
    id: 'light',
    icon: SunMedium,
    label: 'Light',
  },
  {
    id: 'dark',
    icon: MoonStar,
    label: 'Dark',
  },
];

export function AppearanceSettings({
  onThemeChange,
  themePreference,
}: SettingsSectionComponentProps) {
  const themeLabel =
    themePreference.charAt(0).toUpperCase() + themePreference.slice(1);
  const rows: SettingsRow[] = [
    {
      label: 'Current preference',
      description: 'Updates apply immediately.',
      value: themeLabel,
    },
    {
      label: 'Prototype scope',
      description: 'Theme is the only live setting in this version.',
      value: 'Session only',
    },
  ];

  return (
    <>
      <SettingsSectionIntro
        description="Theme is live in-session. The rest of settings stay descriptive in v1."
        eyebrow="Appearance"
        title="Visual tone"
      />

      <div className="mt-6 inline-flex flex-wrap gap-1 rounded-[14px] border border-app-border p-1">
        {themeOptions.map((option) => {
          const Icon = option.icon;
          const isActive = option.id === themePreference;

          return (
            <button
              aria-pressed={isActive}
              className={cn(
                'flex items-center justify-center gap-2 rounded-[10px] px-3 py-2 text-sm transition-colors',
                isActive
                  ? 'bg-app-accent-soft text-app-text'
                  : 'text-app-muted hover:bg-app-card hover:text-app-text',
              )}
              key={option.id}
              onClick={() => onThemeChange(option.id)}
              type="button"
            >
              <Icon className="h-4 w-4" />
              {option.label}
            </button>
          );
        })}
      </div>

      <SettingsRows rows={rows} />
    </>
  );
}
