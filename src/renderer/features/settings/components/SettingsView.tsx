import { settingsSectionRegistry } from '@/renderer/features/settings/config/settings-sections';
import { cn } from '@/renderer/shared/lib/utils';
import { ScrollArea } from '@/renderer/shared/ui/scroll-area';

import { SettingsNav } from './SettingsNav';
import type {
  SettingsRoute,
  ThemePreference,
} from '@/renderer/features/settings/types';

interface SettingsViewProps {
  isCompactShell: boolean;
  onSelectRoute: (route: SettingsRoute) => void;
  onThemeChange: (preference: ThemePreference) => void;
  settingsRoute: SettingsRoute;
  themePreference: ThemePreference;
}

export function SettingsView({
  isCompactShell,
  onSelectRoute,
  onThemeChange,
  settingsRoute,
  themePreference,
}: SettingsViewProps) {
  const SectionComponent = settingsSectionRegistry[settingsRoute].Component;

  return (
    <div
      className={cn(
        'grid h-full min-h-0 min-w-0 grid-rows-[minmax(0,1fr)] overflow-hidden',
        isCompactShell
          ? 'grid-cols-[156px_minmax(0,1fr)]'
          : 'grid-cols-[188px_minmax(0,1fr)]',
      )}
    >
      <SettingsNav
        onSelectRoute={onSelectRoute}
        settingsRoute={settingsRoute}
      />

      <ScrollArea className="min-h-0 min-w-0" contentWidth="fill">
        <div
          className={cn(
            'mx-auto max-w-2xl py-7',
            isCompactShell ? 'px-6' : 'px-8',
          )}
          data-testid="settings-view"
        >
          <SectionComponent
            onThemeChange={onThemeChange}
            themePreference={themePreference}
          />
        </div>
      </ScrollArea>
    </div>
  );
}
