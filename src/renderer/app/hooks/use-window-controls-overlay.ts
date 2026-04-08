import { useEffect, useState } from 'react';

export interface TitlebarAreaRect {
  height: number;
  width: number;
  x: number;
  y: number;
}

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
