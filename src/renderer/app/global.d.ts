import type { DesktopBridge } from '@/shared/electron/desktop-bridge';

export {};

declare global {
  interface Window {
    duneDesktop?: DesktopBridge;
  }
}
