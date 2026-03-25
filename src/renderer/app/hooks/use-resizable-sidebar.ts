import {
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useRef,
  useState,
} from 'react';

export const SIDEBAR_WIDTH_STORAGE_KEY = 'dune.shell.sidebarWidth';
export const SIDEBAR_WIDTH_DEFAULT = 232;
export const SIDEBAR_WIDTH_MIN = 208;
export const SIDEBAR_WIDTH_MAX = 360;

const SIDEBAR_WIDTH_KEYBOARD_STEP = 16;

type SidebarStyle = CSSProperties & {
  '--app-shell-sidebar-width': string;
};

function clampSidebarWidth(width: number) {
  return Math.min(
    SIDEBAR_WIDTH_MAX,
    Math.max(SIDEBAR_WIDTH_MIN, Math.round(width)),
  );
}

function readStoredSidebarWidth() {
  if (typeof window === 'undefined') {
    return SIDEBAR_WIDTH_DEFAULT;
  }

  try {
    const storedWidth = window.localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY);

    if (!storedWidth) {
      return SIDEBAR_WIDTH_DEFAULT;
    }

    const parsedWidth = Number(storedWidth);

    if (!Number.isFinite(parsedWidth)) {
      return SIDEBAR_WIDTH_DEFAULT;
    }

    return clampSidebarWidth(parsedWidth);
  } catch {
    return SIDEBAR_WIDTH_DEFAULT;
  }
}

interface UseResizableSidebarOptions {
  enabled: boolean;
}

export function useResizableSidebar({
  enabled,
}: UseResizableSidebarOptions) {
  const [sidebarWidth, setSidebarWidth] = useState(() => readStoredSidebarWidth());
  const [isResizing, setIsResizing] = useState(false);
  const cleanupDragRef = useRef<(() => void) | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        SIDEBAR_WIDTH_STORAGE_KEY,
        String(clampSidebarWidth(sidebarWidth)),
      );
    } catch {
      // Ignore storage failures and keep the current in-memory width.
    }
  }, [sidebarWidth]);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      cleanupDragRef.current?.();
    };
  }, []);

  useEffect(() => {
    if (!enabled) {
      cleanupDragRef.current?.();
    }
  }, [enabled]);

  const updateSidebarWidth = (nextWidth: number) => {
    setSidebarWidth(clampSidebarWidth(nextWidth));
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    switch (event.key) {
      case 'ArrowLeft':
        event.preventDefault();
        updateSidebarWidth(sidebarWidth - SIDEBAR_WIDTH_KEYBOARD_STEP);
        break;
      case 'ArrowRight':
        event.preventDefault();
        updateSidebarWidth(sidebarWidth + SIDEBAR_WIDTH_KEYBOARD_STEP);
        break;
      case 'Home':
        event.preventDefault();
        updateSidebarWidth(SIDEBAR_WIDTH_MIN);
        break;
      case 'End':
        event.preventDefault();
        updateSidebarWidth(SIDEBAR_WIDTH_MAX);
        break;
      default:
        break;
    }
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!enabled || event.button !== 0) {
      return;
    }

    event.preventDefault();

    cleanupDragRef.current?.();

    const startX = event.clientX;
    const startWidth = sidebarWidth;
    const previousBodyCursor = document.body.style.cursor;
    const previousBodyUserSelect = document.body.style.userSelect;
    const previousRootCursor = document.documentElement.style.cursor;
    const previousRootUserSelect = document.documentElement.style.userSelect;

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.documentElement.style.cursor = 'col-resize';
    document.documentElement.style.userSelect = 'none';
    setIsResizing(true);

    const handlePointerMove = (moveEvent: PointerEvent) => {
      updateSidebarWidth(startWidth + moveEvent.clientX - startX);
    };

    const stopDragging = () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', stopDragging);
      window.removeEventListener('pointercancel', stopDragging);
      document.body.style.cursor = previousBodyCursor;
      document.body.style.userSelect = previousBodyUserSelect;
      document.documentElement.style.cursor = previousRootCursor;
      document.documentElement.style.userSelect = previousRootUserSelect;
      cleanupDragRef.current = null;

      if (isMountedRef.current) {
        setIsResizing(false);
      }
    };

    cleanupDragRef.current = stopDragging;

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', stopDragging);
    window.addEventListener('pointercancel', stopDragging);
  };

  const sidebarStyle: SidebarStyle = {
    '--app-shell-sidebar-width': `${sidebarWidth}px`,
  };

  return {
    isResizing,
    resizeHandleProps: {
      'aria-label': 'Resize sidebar',
      'aria-orientation': 'vertical' as const,
      'aria-valuemax': SIDEBAR_WIDTH_MAX,
      'aria-valuemin': SIDEBAR_WIDTH_MIN,
      'aria-valuenow': sidebarWidth,
      onKeyDown: handleKeyDown,
      onPointerDown: handlePointerDown,
      role: 'separator' as const,
      tabIndex: 0,
    },
    sidebarStyle,
    sidebarWidth,
  };
}
