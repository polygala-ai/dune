// App restart controller tests.

import { describe, expect, it, vi } from 'vitest';

import { createAppRestartController } from '@/electron/main/app-restart';

describe('createAppRestartController', () => {
  it('uses a hard relaunch outside renderer dev mode', async () => {
    const hardRestart = vi.fn();
    const reloadRenderer = vi.fn();
    const restartRuntimeInProcess = vi.fn(async () => {});
    const controller = createAppRestartController({
      hardRestart,
      isRendererDevMode: false,
      reloadRenderer,
      restartRuntimeInProcess,
    });

    await controller.restart();

    expect(hardRestart).toHaveBeenCalledTimes(1);
    expect(restartRuntimeInProcess).not.toHaveBeenCalled();
    expect(reloadRenderer).not.toHaveBeenCalled();
  });

  it('soft restarts the runtime and reloads the renderer in renderer dev mode', async () => {
    const hardRestart = vi.fn();
    const reloadRenderer = vi.fn();
    const restartRuntimeInProcess = vi.fn(async () => {});
    const controller = createAppRestartController({
      hardRestart,
      isRendererDevMode: true,
      reloadRenderer,
      restartRuntimeInProcess,
    });

    await controller.restart();

    expect(hardRestart).not.toHaveBeenCalled();
    expect(restartRuntimeInProcess).toHaveBeenCalledTimes(1);
    expect(reloadRenderer).toHaveBeenCalledTimes(1);
  });

  it('coalesces overlapping renderer dev restarts', async () => {
    let resolveRestart!: () => void;
    const hardRestart = vi.fn();
    const reloadRenderer = vi.fn();
    const restartRuntimeInProcess = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveRestart = resolve;
        }),
    );
    const controller = createAppRestartController({
      hardRestart,
      isRendererDevMode: true,
      reloadRenderer,
      restartRuntimeInProcess,
    });

    const firstRestart = controller.restart();
    const secondRestart = controller.restart();

    expect(restartRuntimeInProcess).toHaveBeenCalledTimes(1);
    expect(reloadRenderer).not.toHaveBeenCalled();

    resolveRestart();
    await Promise.all([firstRestart, secondRestart]);

    expect(hardRestart).not.toHaveBeenCalled();
    expect(reloadRenderer).toHaveBeenCalledTimes(1);
  });
});
