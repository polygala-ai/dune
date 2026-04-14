import { describe, expect, it } from 'vitest';

import { createMainWindowOptions } from '@/electron/main/window/create-main-window-options';
import { MAC_TITLEBAR_OVERLAY_HEIGHT } from '@/shared/window/titlebar';

describe('createMainWindowOptions', () => {
  it('uses a hidden macOS titlebar with a native overlay', () => {
    const options = createMainWindowOptions('darwin', '/tmp/preload.js');

    expect(options.frame).toBeUndefined();
    expect(options.titleBarStyle).toBe('hidden');
    expect(options.titleBarOverlay).toEqual({ height: MAC_TITLEBAR_OVERLAY_HEIGHT });
    expect(options.backgroundColor).toBe('#f3eee7');
    expect(options.minWidth).toBe(960);
    expect(options.webPreferences?.preload).toBe('/tmp/preload.js');
    expect(options.webPreferences?.contextIsolation).toBe(true);
    expect(options.webPreferences?.sandbox).toBe(true);
    expect(options.webPreferences?.nodeIntegration).toBe(false);
  });

  it('keeps native window chrome unchanged on non-macOS platforms', () => {
    const options = createMainWindowOptions('win32', '/tmp/preload.js');

    expect(options.frame).toBeUndefined();
    expect(options.titleBarStyle).toBeUndefined();
    expect(options.titleBarOverlay).toBeUndefined();
    expect(options.backgroundColor).toBe('#f3eee7');
    expect(options.minWidth).toBe(960);
    expect(options.webPreferences?.preload).toBe('/tmp/preload.js');
  });
});
