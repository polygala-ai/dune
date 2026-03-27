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

function getPlatform(): NodeJS.Platform {
  return window.duneDesktop?.platform ?? inferBrowserPlatform();
}

export function isMacPlatform() {
  return getPlatform() === 'darwin';
}

export function primaryModifierLabel() {
  return isMacPlatform() ? '⌘' : 'Ctrl';
}

export function platformName() {
  return getPlatform();
}
