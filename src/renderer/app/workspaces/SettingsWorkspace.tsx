// Settings workspace UI.

import { CompactShellToolbar } from '@/renderer/app/shell/CompactShellToolbar';
import { SettingsView } from '@/renderer/features/settings/components/SettingsView';

import type {
  SettingsRoute,
  ThemePreference,
} from '@/renderer/features/settings/types';
import type {
  Agent,
  AgentRuntimeInfo,
  CodingEngineStatus,
  ExternalChannelsState,
} from '@/renderer/features/agents/types';

/** Settings workspace props. */
interface SettingsWorkspaceProps {
  agents: Agent[];
  codingEngines: CodingEngineStatus[];
  externalChannels: ExternalChannelsState;
  isCompactShell: boolean;
  isSidebarOpen: boolean;
  onSelectRoute: (route: SettingsRoute) => void;
  onThemeChange: (preference: ThemePreference) => void;
  onToggleSidebar: () => void;
  runtimeInfo: AgentRuntimeInfo;
  settingsRoute: SettingsRoute;
  showCompactSidebarToggle: boolean;
  themePreference: ThemePreference;
}

/** Renders the settings workspace UI. */
export function SettingsWorkspace({
  agents,
  codingEngines,
  externalChannels,
  isCompactShell,
  isSidebarOpen,
  onSelectRoute,
  onThemeChange,
  onToggleSidebar,
  runtimeInfo,
  settingsRoute,
  showCompactSidebarToggle,
  themePreference,
}: SettingsWorkspaceProps) {
  return (
    <>
      {isCompactShell ? (
        <CompactShellToolbar
          isSidebarOpen={isSidebarOpen}
          onToggleSidebar={onToggleSidebar}
          showSidebarToggle={showCompactSidebarToggle}
        />
      ) : null}

      <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
        <SettingsView
          agents={agents}
          codingEngines={codingEngines}
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
