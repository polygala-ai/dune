import { createDesktopBridge } from '@/shared/electron/desktop-bridge';

function inferBrowserPlatform(): NodeJS.Platform {
  const normalizedPlatform = navigator.platform.toLowerCase();

  if (normalizedPlatform.includes('mac')) {
    return 'darwin';
  }

  if (normalizedPlatform.includes('win')) {
    return 'win32';
  }

  return 'linux';
}

function getDesktopBridge() {
  return (
    window.duneDesktop ??
    createDesktopBridge(inferBrowserPlatform())
  );
}

export function isMacPlatform() {
  return getDesktopBridge().isMac;
}

export function primaryModifierLabel() {
  return isMacPlatform() ? '⌘' : 'Ctrl';
}

export function platformName() {
  return getDesktopBridge().platform;
}
