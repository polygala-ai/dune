import { CompactShellToolbar } from '@/renderer/app/shell/CompactShellToolbar';
import { SettingsView } from '@/renderer/features/settings/components/SettingsView';

import type {
  SettingsRoute,
  ThemePreference,
} from '@/renderer/features/settings/types';

interface SettingsWorkspaceProps {
  isCompactShell: boolean;
  isSidebarOpen: boolean;
  onSelectRoute: (route: SettingsRoute) => void;
  onThemeChange: (preference: ThemePreference) => void;
  onToggleSidebar: () => void;
  settingsRoute: SettingsRoute;
  themePreference: ThemePreference;
}

export function SettingsWorkspace({
  isCompactShell,
  isSidebarOpen,
  onSelectRoute,
  onThemeChange,
  onToggleSidebar,
  settingsRoute,
  themePreference,
}: SettingsWorkspaceProps) {
  return (
    <>
      {isCompactShell ? (
        <CompactShellToolbar
          isSidebarOpen={isSidebarOpen}
          onToggleSidebar={onToggleSidebar}
        />
      ) : null}

      <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
        <SettingsView
          isCompactShell={isCompactShell}
          onSelectRoute={onSelectRoute}
          onThemeChange={onThemeChange}
          settingsRoute={settingsRoute}
          themePreference={themePreference}
        />
      </div>
    </>
  );
}
