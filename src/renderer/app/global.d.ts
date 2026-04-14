// Ambient globals for the renderer app.

import type { DesktopBridge } from '@/shared/electron/desktop-bridge';

export {};

declare global {
  /** Window controls overlay shape. */
  interface WindowControlsOverlay extends EventTarget {
    readonly visible: boolean;
    getTitlebarAreaRect(): DOMRect;
  }

  /** Navigator shape. */
  interface Navigator {
    windowControlsOverlay?: WindowControlsOverlay;
  }

  /** Window shape. */
  interface Window {
    duneDesktop?: DesktopBridge;
  }
}
