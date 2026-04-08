import type { DesktopBridge } from '@/shared/electron/desktop-bridge';

export {};

declare global {
  interface WindowControlsOverlay extends EventTarget {
    readonly visible: boolean;
    getTitlebarAreaRect(): DOMRect;
  }

  interface Navigator {
    windowControlsOverlay?: WindowControlsOverlay;
  }

  interface Window {
    duneDesktop?: DesktopBridge;
  }
}
