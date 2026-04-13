import {
  startTransition,
  useEffect,
  useEffectEvent,
  useState,
} from 'react';

import type { AppRoute } from '@/renderer/app/store/types';
import type {
  CreateAgentInput,
  PresentedAgent,
} from '@/renderer/features/agents/types';

export interface AgentShellControllerCommands {
  createAgent: (input: CreateAgentInput) => Promise<string>;
  openAgent: (agentId: string) => void;
  openSettings: () => void;
  setCommandOpen: (isOpen: boolean) => void;
  toggleInspector: (force?: boolean) => void;
}

interface UseAgentShellControllerOptions {
  activeAgent: PresentedAgent | null;
  commands: AgentShellControllerCommands;
  focusComposer: () => void;
  isCompactShell: boolean;
  route: AppRoute;
}

export function useAgentShellController({
  activeAgent,
  commands,
  focusComposer,
  isCompactShell,
  route,
}: UseAgentShellControllerOptions) {
  const [isCreateAgentOpen, setCreateAgentOpen] = useState(false);
  const [isSidebarDrawerOpen, setSidebarDrawerOpen] = useState(false);

  useEffect(() => {
    if (!isCompactShell) {
      setSidebarDrawerOpen(false);
    }
  }, [isCompactShell]);

  useEffect(() => {
    if (route === 'agent' && activeAgent) {
      focusComposer();
    }
  }, [activeAgent, focusComposer, route]);

  const handleCreateAgentDialogOpenChange = useEffectEvent((open: boolean) => {
    setCreateAgentOpen(open);
  });

  const handleSidebarDrawerOpenChange = useEffectEvent((open: boolean) => {
    setSidebarDrawerOpen(open);
  });

  const handleOpenCreateAgent = useEffectEvent(() => {
    setSidebarDrawerOpen(false);
    commands.setCommandOpen(false);
    setCreateAgentOpen(true);
  });

  const handleCreateAgent = useEffectEvent(async (input: CreateAgentInput) => {
    const agentId = await commands.createAgent(input);
    setCreateAgentOpen(false);
    setSidebarDrawerOpen(false);
    focusComposer();
    return agentId;
  });

  const handleOpenSettings = useEffectEvent(() => {
    startTransition(() => {
      setSidebarDrawerOpen(false);
      commands.openSettings();
    });
  });

  const handleOpenCommand = useEffectEvent(() => {
    commands.setCommandOpen(true);
  });

  const handleCloseCommand = useEffectEvent(() => {
    commands.setCommandOpen(false);
  });

  const handleSelectAgent = useEffectEvent((agentId: string) => {
    setSidebarDrawerOpen(false);
    commands.openAgent(agentId);
  });

  const handleToggleSidebar = useEffectEvent(() => {
    setSidebarDrawerOpen((open) => !open);
  });

  const handleCloseContextPanel = useEffectEvent(() => {
    commands.toggleInspector(false);
  });

  const handleToggleContextPanel = useEffectEvent(() => {
    commands.toggleInspector();
  });

  return {
    handleCloseCommand,
    handleCloseContextPanel,
    handleCreateAgent,
    handleCreateAgentDialogOpenChange,
    handleOpenCommand,
    handleOpenCreateAgent,
    handleOpenSettings,
    handleSelectAgent,
    handleSidebarDrawerOpenChange,
    handleToggleContextPanel,
    handleToggleSidebar,
    isCreateAgentOpen,
    isSidebarDrawerOpen,
  };
}
