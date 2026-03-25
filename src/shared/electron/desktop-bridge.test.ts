import { describe, expect, it } from 'vitest';

import { createDesktopBridge } from '@/shared/electron/desktop-bridge';

describe('createDesktopBridge', () => {
  it('maps the platform into a renderer-safe bridge object', () => {
    expect(createDesktopBridge('darwin')).toEqual({
      isMac: true,
      platform: 'darwin',
    });
    expect(createDesktopBridge('win32')).toEqual({
      isMac: false,
      platform: 'win32',
    });
  });
});
