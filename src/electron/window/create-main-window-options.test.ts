import { describe, expect, it } from 'vitest';

import { createMainWindowOptions } from '@/electron/window/create-main-window-options';

describe('createMainWindowOptions', () => {
  it('uses a frameless macOS window while keeping traffic lights configurable', () => {
    const options = createMainWindowOptions('darwin', '/tmp/preload.js');

    expect(options.frame).toBe(false);
    expect(options.titleBarStyle).toBeUndefined();
    expect(options.trafficLightPosition).toEqual({ x: 18, y: 16 });
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
    expect(options.trafficLightPosition).toBeUndefined();
    expect(options.backgroundColor).toBe('#f3eee7');
    expect(options.minWidth).toBe(960);
    expect(options.webPreferences?.preload).toBe('/tmp/preload.js');
  });
});
