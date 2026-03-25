import { Wrench } from 'lucide-react';

import { settingsSections } from '@/renderer/features/settings/config/settings-sections';
import type { SettingsRoute } from '@/renderer/features/settings/types';
import { useDesktopPlatform } from '@/renderer/shared/lib/use-desktop-platform';
import { cn } from '@/renderer/shared/lib/utils';

interface SettingsNavProps {
  onSelectRoute: (route: SettingsRoute) => void;
  settingsRoute: SettingsRoute;
}

export function SettingsNav({
  onSelectRoute,
  settingsRoute,
}: SettingsNavProps) {
  const { isMac } = useDesktopPlatform();

  return (
    <aside
      className={cn('border-r border-app-border px-4 pb-5 pt-5')}
      data-platform-inset={isMac ? 'mac' : 'none'}
      data-testid="settings-nav"
    >
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-app-muted">
        <Wrench className="h-3.5 w-3.5" />
        Settings
      </div>

      <nav className="mt-6 space-y-2">
        {settingsSections.map((section) => (
          <button
            data-active-style={section.id === settingsRoute ? 'fill' : 'idle'}
            className={cn(
              'w-full rounded-[12px] px-3 py-2.5 text-left transition-colors',
              section.id === settingsRoute
                ? 'bg-app-accent-soft text-app-text'
                : 'text-app-muted hover:bg-app-card hover:text-app-text',
            )}
            key={section.id}
            onClick={() => onSelectRoute(section.id)}
            type="button"
          >
            <span className="block text-sm font-semibold text-app-text">
              {section.title}
            </span>
            <span className="mt-1 block text-xs leading-5 opacity-80">
              {section.description}
            </span>
          </button>
        ))}
      </nav>
    </aside>
  );
}
