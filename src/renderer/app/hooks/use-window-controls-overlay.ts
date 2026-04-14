// Window controls overlay hook.

import { useEffect, useState } from 'react';

/** Titlebar area rect shape. */
export interface TitlebarAreaRect {
  height: number;
  width: number;
  x: number;
  y: number;
}

/** Reads titlebar area rect. */
function readTitlebarAreaRect(): TitlebarAreaRect | null {
  const overlay = navigator.windowControlsOverlay;

  if (!overlay || !overlay.visible) {
    return null;
  }

  const rect = overlay.getTitlebarAreaRect();

  return {
    height: rect.height,
    width: rect.width,
    x: rect.x,
    y: rect.y,
  };
}

/** Window controls overlay hook. */
export function useWindowControlsOverlay(enabled: boolean) {
  const [rect, setRect] = useState<TitlebarAreaRect | null>(() =>
    enabled ? readTitlebarAreaRect() : null,
  );

  useEffect(() => {
    if (!enabled) {
      setRect(null);
      return;
    }

    const overlay = navigator.windowControlsOverlay;

    if (!overlay) {
      setRect(null);
      return;
    }

    /** Synchronizes rect. */
    const syncRect = () => {
      setRect(readTitlebarAreaRect());
    };

    syncRect();
    overlay.addEventListener('geometrychange', syncRect);

    return () => {
      overlay.removeEventListener('geometrychange', syncRect);
    };
  }, [enabled]);

  return rect;
}
