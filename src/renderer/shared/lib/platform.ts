// Renderer platform helpers.

/** Infers browser platform. */
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

/** Returns platform. */
function getPlatform(): NodeJS.Platform {
  return window.duneDesktop?.platform ?? inferBrowserPlatform();
}

/** Returns whether Mac platform. */
export function isMacPlatform() {
  return getPlatform() === 'darwin';
}

/** Primaries modifier label. */
export function primaryModifierLabel() {
  return isMacPlatform() ? '⌘' : 'Ctrl';
}

/** Platforms name. */
export function platformName() {
  return getPlatform();
}
