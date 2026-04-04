import { CompactShellToolbar } from '@/renderer/app/shell/CompactShellToolbar';
import { SettingsView } from '@/renderer/features/settings/components/SettingsView';

import type {
  SettingsRoute,
  ThemePreference,
} from '@/renderer/features/settings/types';
import type {
  Agent,
  AgentRuntimeInfo,
  ExternalChannelsState,
} from '@/renderer/features/agents/types';

interface SettingsWorkspaceProps {
  agents: Agent[];
  externalChannels: ExternalChannelsState;
  isCompactShell: boolean;
  isSidebarOpen: boolean;
  onSelectRoute: (route: SettingsRoute) => void;
  onThemeChange: (preference: ThemePreference) => void;
  onToggleSidebar: () => void;
  runtimeInfo: AgentRuntimeInfo;
  settingsRoute: SettingsRoute;
  themePreference: ThemePreference;
}

export function SettingsWorkspace({
  agents,
  externalChannels,
  isCompactShell,
  isSidebarOpen,
  onSelectRoute,
  onThemeChange,
  onToggleSidebar,
  runtimeInfo,
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
          agents={agents}
          externalChannels={externalChannels}
          isCompactShell={isCompactShell}
          onSelectRoute={onSelectRoute}
          onThemeChange={onThemeChange}
          runtimeInfo={runtimeInfo}
          settingsRoute={settingsRoute}
          themePreference={themePreference}
        />
      </div>
    </>
  );
}
