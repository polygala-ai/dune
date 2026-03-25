export interface DesktopBridge {
  isMac: boolean;
  platform: NodeJS.Platform;
}

export function createDesktopBridge(platform: NodeJS.Platform): DesktopBridge {
  return {
    isMac: platform === 'darwin',
    platform,
  };
}
