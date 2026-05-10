// Quit coordinator tests.

import { describe, expect, it, vi } from 'vitest';

import { createQuitCoordinator } from '@/electron/main/quit-coordinator';

/** Flushes microtasks. */
async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
}

describe('createQuitCoordinator', () => {
  it('waits for runtime shutdown before allowing quit to continue', async () => {
    const quit = vi.fn();
    let resolveShutdown!: () => void;
    const shutdownRuntime = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveShutdown = resolve;
        }),
    );
    const coordinator = createQuitCoordinator({
      app: {
        quit,
        relaunch: vi.fn(),
      },
      shutdownRuntime,
    });
    const firstEvent = { preventDefault: vi.fn() };
    const secondEvent = { preventDefault: vi.fn() };
    const finalEvent = { preventDefault: vi.fn() };

    coordinator.handleBeforeQuit(firstEvent);
    coordinator.handleBeforeQuit(secondEvent);

    expect(firstEvent.preventDefault).toHaveBeenCalledTimes(1);
    expect(secondEvent.preventDefault).toHaveBeenCalledTimes(1);
    expect(shutdownRuntime).toHaveBeenCalledTimes(1);
    expect(quit).not.toHaveBeenCalled();

    resolveShutdown();
    await flushMicrotasks();

    expect(quit).toHaveBeenCalledTimes(1);

    coordinator.handleBeforeQuit(finalEvent);
    expect(finalEvent.preventDefault).not.toHaveBeenCalled();
  });

  it('relaunches before quitting and still waits for shutdown', async () => {
    const quit = vi.fn();
    const relaunch = vi.fn();
    let resolveShutdown!: () => void;
    const coordinator = createQuitCoordinator({
      app: {
        quit,
        relaunch,
      },
      shutdownRuntime: () =>
        new Promise<void>((resolve) => {
          resolveShutdown = resolve;
        }),
    });

    coordinator.restart();

    expect(relaunch).toHaveBeenCalledTimes(1);
    expect(quit).not.toHaveBeenCalled();

    resolveShutdown();
    await flushMicrotasks();

    expect(quit).toHaveBeenCalledTimes(1);
    expect(relaunch.mock.invocationCallOrder[0] ?? -1).toBeLessThan(
      quit.mock.invocationCallOrder[0] ?? -1,
    );
  });

  it('only schedules one relaunch when restart is requested repeatedly', async () => {
    const quit = vi.fn();
    const relaunch = vi.fn();
    const coordinator = createQuitCoordinator({
      app: {
        quit,
        relaunch,
      },
      shutdownRuntime: async () => {},
    });

    coordinator.restart();
    coordinator.restart();
    await flushMicrotasks();

    expect(relaunch).toHaveBeenCalledTimes(1);
    expect(quit).toHaveBeenCalledTimes(1);
  });

  it('continues quitting even if runtime shutdown fails', async () => {
    const error = new Error('shutdown failed');
    const onShutdownError = vi.fn();
    const quit = vi.fn();
    const coordinator = createQuitCoordinator({
      app: {
        quit,
        relaunch: vi.fn(),
      },
      onShutdownError,
      shutdownRuntime: async () => {
        throw error;
      },
    });

    coordinator.handleBeforeQuit({ preventDefault: vi.fn() });
    await flushMicrotasks();

    expect(onShutdownError).toHaveBeenCalledWith(error);
    expect(quit).toHaveBeenCalledTimes(1);
  });
});
