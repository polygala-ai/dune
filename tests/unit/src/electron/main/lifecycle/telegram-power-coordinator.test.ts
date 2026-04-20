// Telegram power coordinator tests.

import { describe, expect, it, vi } from 'vitest';

import { createTelegramPowerCoordinator } from '@/electron/main/lifecycle/telegram-power-coordinator';

/** Flushes pending microtasks. */
async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
}

class TestPowerMonitor {
  private readonly listeners = new Map<string, Set<() => void>>();

  emit(event: string) {
    for (const listener of this.listeners.get(event) ?? []) {
      listener();
    }
  }

  on(event: string, listener: () => void) {
    const listeners = this.listeners.get(event) ?? new Set<() => void>();
    listeners.add(listener);
    this.listeners.set(event, listeners);
  }

  removeListener(event: string, listener: () => void) {
    this.listeners.get(event)?.delete(listener);
  }
}

const activeSnapshot = {
  agents: [{
    channel: { id: 'telegram' },
    telegram: { status: 'connected' },
  }],
  telegramSetupSessions: [],
};

const inactiveSnapshot = {
  agents: [{
    channel: { id: 'local' },
    telegram: { status: 'not-configured' },
  }],
  telegramSetupSessions: [],
};

describe('createTelegramPowerCoordinator', () => {
  it('starts and stops the blocker only on macOS', () => {
    const powerMonitor = new TestPowerMonitor();
    const start = vi.fn(() => 17);
    const stop = vi.fn();
    const coordinator = createTelegramPowerCoordinator({
      getRuntimeController: () => ({
        getSnapshot: () => activeSnapshot as any,
        reloadExternalChannels: vi.fn(),
      }),
      platform: 'darwin',
      powerMonitor,
      powerSaveBlocker: { start, stop },
    });

    coordinator.syncFromSnapshot(activeSnapshot as any);
    coordinator.syncFromSnapshot(inactiveSnapshot as any);

    expect(start).toHaveBeenCalledWith('prevent-app-suspension');
    expect(stop).toHaveBeenCalledWith(17);

    const windowsCoordinator = createTelegramPowerCoordinator({
      getRuntimeController: () => ({
        getSnapshot: () => activeSnapshot as any,
        reloadExternalChannels: vi.fn(),
      }),
      platform: 'win32',
      powerMonitor: new TestPowerMonitor(),
      powerSaveBlocker: { start: vi.fn(), stop: vi.fn() },
    });

    windowsCoordinator.syncFromSnapshot(activeSnapshot as any);
    expect(start).toHaveBeenCalledTimes(1);
  });

  it('reconnects only for wake events while Telegram is active', async () => {
    const powerMonitor = new TestPowerMonitor();
    const reloadExternalChannels = vi.fn(async () => {});
    let snapshot = activeSnapshot;
    const coordinator = createTelegramPowerCoordinator({
      getRuntimeController: () => ({
        getSnapshot: () => snapshot as any,
        reloadExternalChannels,
      }),
      platform: 'darwin',
      powerMonitor,
      powerSaveBlocker: { start: vi.fn(() => 1), stop: vi.fn() },
    });

    coordinator.registerPowerMonitorListeners();
    powerMonitor.emit('resume');
    await flushMicrotasks();

    snapshot = inactiveSnapshot;
    powerMonitor.emit('unlock-screen');
    await flushMicrotasks();

    expect(reloadExternalChannels).toHaveBeenCalledTimes(1);
  });

  it('deduplicates concurrent reconnect requests', async () => {
    const powerMonitor = new TestPowerMonitor();
    let resolveReload!: () => void;
    const reloadExternalChannels = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveReload = resolve;
        }),
    );
    const coordinator = createTelegramPowerCoordinator({
      getRuntimeController: () => ({
        getSnapshot: () => activeSnapshot as any,
        reloadExternalChannels,
      }),
      platform: 'darwin',
      powerMonitor,
      powerSaveBlocker: { start: vi.fn(() => 1), stop: vi.fn() },
    });

    coordinator.registerPowerMonitorListeners();
    powerMonitor.emit('resume');
    powerMonitor.emit('unlock-screen');

    expect(reloadExternalChannels).toHaveBeenCalledTimes(1);

    resolveReload();
    await flushMicrotasks();

    powerMonitor.emit('resume');
    await flushMicrotasks();

    expect(reloadExternalChannels).toHaveBeenCalledTimes(2);
  });
});
