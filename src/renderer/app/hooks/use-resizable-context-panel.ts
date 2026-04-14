// Resizable context panel hook.

import {
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useRef,
  useState,
} from 'react';

/** Storage key for context panel width storage. */
export const CONTEXT_PANEL_WIDTH_STORAGE_KEY = 'dune.shell.contextPanelWidth';
/** Context panel width default constant. */
export const CONTEXT_PANEL_WIDTH_DEFAULT = 340;
/** Context panel width min constant. */
export const CONTEXT_PANEL_WIDTH_MIN = 260;
/** Context panel width max constant. */
export const CONTEXT_PANEL_WIDTH_MAX = 420;

const CONTEXT_PANEL_WIDTH_KEYBOARD_STEP = 16;

/** Context panel style shape. */
type ContextPanelStyle = CSSProperties & {
  '--app-shell-context-width': string;
  '--app-shell-overlay-context-width': string;
};

/** Clamps context panel width. */
function clampContextPanelWidth(width: number) {
  return Math.min(
    CONTEXT_PANEL_WIDTH_MAX,
    Math.max(CONTEXT_PANEL_WIDTH_MIN, Math.round(width)),
  );
}

/** Reads stored context panel width. */
function readStoredContextPanelWidth() {
  if (typeof window === 'undefined') {
    return CONTEXT_PANEL_WIDTH_DEFAULT;
  }

  try {
    const storedWidth = window.localStorage.getItem(CONTEXT_PANEL_WIDTH_STORAGE_KEY);

    if (!storedWidth) {
      return CONTEXT_PANEL_WIDTH_DEFAULT;
    }

    const parsedWidth = Number(storedWidth);

    if (!Number.isFinite(parsedWidth)) {
      return CONTEXT_PANEL_WIDTH_DEFAULT;
    }

    return clampContextPanelWidth(parsedWidth);
  } catch {
    return CONTEXT_PANEL_WIDTH_DEFAULT;
  }
}

/** Use resizable context panel options. */
interface UseResizableContextPanelOptions {
  enabled: boolean;
}

/** Resizable context panel hook. */
export function useResizableContextPanel({
  enabled,
}: UseResizableContextPanelOptions) {
  const [contextPanelWidth, setContextPanelWidth] = useState(() =>
    readStoredContextPanelWidth(),
  );
  const [isResizing, setIsResizing] = useState(false);
  const cleanupDragRef = useRef<(() => void) | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        CONTEXT_PANEL_WIDTH_STORAGE_KEY,
        String(clampContextPanelWidth(contextPanelWidth)),
      );
    } catch {
      // Ignore storage failures and keep the current in-memory width.
    }
  }, [contextPanelWidth]);

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

  /** Updates context panel width. */
  const updateContextPanelWidth = (nextWidth: number) => {
    setContextPanelWidth(clampContextPanelWidth(nextWidth));
  };

  /** Handles down key. */
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    switch (event.key) {
      case 'ArrowLeft':
        event.preventDefault();
        updateContextPanelWidth(contextPanelWidth + CONTEXT_PANEL_WIDTH_KEYBOARD_STEP);
        break;
      case 'ArrowRight':
        event.preventDefault();
        updateContextPanelWidth(contextPanelWidth - CONTEXT_PANEL_WIDTH_KEYBOARD_STEP);
        break;
      case 'Home':
        event.preventDefault();
        updateContextPanelWidth(CONTEXT_PANEL_WIDTH_MIN);
        break;
      case 'End':
        event.preventDefault();
        updateContextPanelWidth(CONTEXT_PANEL_WIDTH_MAX);
        break;
      default:
        break;
    }
  };

  /** Handles down pointer. */
  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!enabled || event.button !== 0) {
      return;
    }

    event.preventDefault();

    cleanupDragRef.current?.();

    const startX = event.clientX;
    const startWidth = contextPanelWidth;
    const previousBodyCursor = document.body.style.cursor;
    const previousBodyUserSelect = document.body.style.userSelect;
    const previousRootCursor = document.documentElement.style.cursor;
    const previousRootUserSelect = document.documentElement.style.userSelect;

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.documentElement.style.cursor = 'col-resize';
    document.documentElement.style.userSelect = 'none';
    setIsResizing(true);

    /** Handles move pointer. */
    const handlePointerMove = (moveEvent: PointerEvent) => {
      updateContextPanelWidth(startWidth - (moveEvent.clientX - startX));
    };

    /** Stops dragging. */
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

  const contextPanelStyle: ContextPanelStyle = {
    '--app-shell-context-width': `${contextPanelWidth}px`,
    '--app-shell-overlay-context-width': `${contextPanelWidth}px`,
  };

  return {
    contextPanelStyle,
    contextPanelWidth,
    isResizing,
    resizeHandleProps: {
      'aria-label': 'Resize inspector',
      'aria-orientation': 'vertical' as const,
      'aria-valuemax': CONTEXT_PANEL_WIDTH_MAX,
      'aria-valuemin': CONTEXT_PANEL_WIDTH_MIN,
      'aria-valuenow': contextPanelWidth,
      onKeyDown: handleKeyDown,
      onPointerDown: handlePointerDown,
      role: 'separator' as const,
      tabIndex: 0,
    },
  };
}
