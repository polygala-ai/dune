// Responsive shell hook.

import { useEffect, useState } from 'react';

const COMPACT_SHELL_BREAKPOINT = 1240;
const INLINE_CONTEXT_BREAKPOINT = 1440;

/** Shell layout mode shape. */
export type ShellLayoutMode = 'compact' | 'medium' | 'wide';

/** Returns layout mode. */
function getLayoutMode(windowWidth: number): ShellLayoutMode {
  if (windowWidth < COMPACT_SHELL_BREAKPOINT) {
    return 'compact';
  }

  if (windowWidth < INLINE_CONTEXT_BREAKPOINT) {
    return 'medium';
  }

  return 'wide';
}

/** Responsive shell hook. */
export function useResponsiveShell(
  showContextPanel: boolean,
  lockCompactShell = false,
) {
  const [windowWidth, setWindowWidth] = useState(() => window.innerWidth);

  useEffect(() => {
    /** Handles resize. */
    const handleResize = () => {
      setWindowWidth(window.innerWidth);
    };

    setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  const layoutMode = lockCompactShell ? 'compact' : getLayoutMode(windowWidth);

  return {
    isCompactShell: layoutMode === 'compact',
    layoutMode,
    usesInlineContext: showContextPanel && layoutMode === 'wide',
    usesOverlayContext: showContextPanel && layoutMode !== 'wide',
  };
}
