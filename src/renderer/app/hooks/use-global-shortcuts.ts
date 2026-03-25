import { useEffect, useEffectEvent } from 'react';

import type { AppRoute } from '@/renderer/app/store/types';

interface UseGlobalShortcutsOptions {
  isCommandOpen: boolean;
  isMac: boolean;
  onCloseCommand: () => void;
  onCloseContextPanel: () => void;
  onCreateAgent: () => void;
  onCycleAgent: (direction: -1 | 1) => void;
  onOpenCommand: () => void;
  onOpenSettings: () => void;
  onToggleContextPanel: () => void;
  route: AppRoute;
  usesOverlayContext: boolean;
}

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const tagName = target.tagName.toLowerCase();

  return (
    tagName === 'input' ||
    tagName === 'textarea' ||
    tagName === 'select' ||
    target.isContentEditable
  );
}

export function useGlobalShortcuts({
  isCommandOpen,
  isMac,
  onCloseCommand,
  onCloseContextPanel,
  onCreateAgent,
  onCycleAgent,
  onOpenCommand,
  onOpenSettings,
  onToggleContextPanel,
  route,
  usesOverlayContext,
}: UseGlobalShortcutsOptions) {
  const handleGlobalKeyDown = useEffectEvent((event: KeyboardEvent) => {
    const usesPrimaryModifier = isMac ? event.metaKey : event.ctrlKey;
    const key = event.key.toLowerCase();

    if (usesPrimaryModifier && key === 'k') {
      event.preventDefault();
      onOpenCommand();
      return;
    }

    if (usesPrimaryModifier && key === 'n') {
      event.preventDefault();
      onCreateAgent();
      return;
    }

    if (usesPrimaryModifier && event.key === ',') {
      event.preventDefault();
      onOpenSettings();
      return;
    }

    if (usesPrimaryModifier && event.key === '\\') {
      event.preventDefault();

      if (route === 'agent') {
        onToggleContextPanel();
      }
      return;
    }

    if (event.key === 'Escape' && isCommandOpen) {
      event.preventDefault();
      onCloseCommand();
      return;
    }

    if (event.key === 'Escape' && usesOverlayContext) {
      event.preventDefault();
      onCloseContextPanel();
      return;
    }

    if (
      route === 'agent' &&
      !isCommandOpen &&
      !isEditableTarget(event.target) &&
      event.key === 'ArrowUp'
    ) {
      event.preventDefault();
      onCycleAgent(-1);
      return;
    }

    if (
      route === 'agent' &&
      !isCommandOpen &&
      !isEditableTarget(event.target) &&
      event.key === 'ArrowDown'
    ) {
      event.preventDefault();
      onCycleAgent(1);
    }
  });

  useEffect(() => {
    window.addEventListener('keydown', handleGlobalKeyDown);

    return () => {
      window.removeEventListener('keydown', handleGlobalKeyDown);
    };
  }, [handleGlobalKeyDown]);
}
