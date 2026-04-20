// Telegram/macOS power lifecycle coordination.

import {
  powerMonitor as electronPowerMonitor,
  powerSaveBlocker as electronPowerSaveBlocker,
} from 'electron';

import type { DesktopRuntimeController } from '@/electron/main/runtime/desktop-runtime-controller';
import type { AgentServiceSnapshot } from '@/shared/agents/agent-runtime';

type TelegramPowerController = Pick<DesktopRuntimeController, 'getSnapshot' | 'reloadExternalChannels'>;

interface PowerMonitorLike {
  on(
    event: 'lock-screen' | 'resume' | 'suspend' | 'unlock-screen',
    listener: () => void,
  ): void;
  removeListener(
    event: 'lock-screen' | 'resume' | 'suspend' | 'unlock-screen',
    listener: () => void,
  ): void;
}

interface PowerSaveBlockerLike {
  start(type: 'prevent-app-suspension'): number;
  stop(id: number): void;
}

interface TelegramPowerCoordinatorOptions {
  getRuntimeController: () => TelegramPowerController | null;
  platform?: NodeJS.Platform;
  powerMonitor?: PowerMonitorLike;
  powerSaveBlocker?: PowerSaveBlockerLike;
}

/** Creates Telegram/macOS power-management hooks. */
export function createTelegramPowerCoordinator(options: TelegramPowerCoordinatorOptions) {
  const platform = options.platform ?? process.platform;
  const powerMonitor = options.powerMonitor ?? electronPowerMonitor;
  const powerSaveBlocker = options.powerSaveBlocker ?? electronPowerSaveBlocker;
  let powerBlockerId: number | null = null;
  let reconnectPromise: Promise<void> | null = null;
  let listenersRegistered = false;

  function hasActiveTelegramChannels(snapshot: AgentServiceSnapshot) {
    return snapshot.agents.some((agent) =>
      agent.channel.id === 'telegram' && agent.telegram?.status !== 'not-configured'
    ) || snapshot.telegramSetupSessions.length > 0;
  }

  function startPowerBlocker() {
    if (platform !== 'darwin' || powerBlockerId !== null) {
      return;
    }

    powerBlockerId = powerSaveBlocker.start('prevent-app-suspension');
    console.info('Started the macOS App Nap blocker for Telegram polling.', {
      powerBlockerId,
    });
  }

  function stopPowerBlocker() {
    if (powerBlockerId === null) {
      return;
    }

    powerSaveBlocker.stop(powerBlockerId);
    console.info('Stopped the macOS App Nap blocker for Telegram polling.', {
      powerBlockerId,
    });
    powerBlockerId = null;
  }

  function syncFromSnapshot(snapshot: AgentServiceSnapshot) {
    if (hasActiveTelegramChannels(snapshot)) {
      startPowerBlocker();
      return;
    }

    stopPowerBlocker();
  }

  async function reconnectTelegramChannels(reason: 'resume' | 'unlock-screen') {
    if (platform !== 'darwin') {
      return;
    }

    if (reconnectPromise) {
      return reconnectPromise;
    }

    reconnectPromise = (async () => {
      const runtimeController = options.getRuntimeController();

      if (!runtimeController) {
        return;
      }

      if (!hasActiveTelegramChannels(runtimeController.getSnapshot())) {
        return;
      }

      console.info(`macOS ${reason} detected. Reconnecting Telegram polling.`);
      await runtimeController.reloadExternalChannels();
    })()
      .catch((error) => {
        console.error(`Failed to reconnect Telegram polling after macOS ${reason}.`, error);
      })
      .finally(() => {
        reconnectPromise = null;
      });

    return reconnectPromise;
  }

  const onSuspend = () => {
    console.info('macOS suspend detected.');
  };
  const onLockScreen = () => {
    console.info('macOS lock-screen detected.');
  };
  const onResume = () => {
    void reconnectTelegramChannels('resume');
  };
  const onUnlockScreen = () => {
    void reconnectTelegramChannels('unlock-screen');
  };

  function registerPowerMonitorListeners() {
    if (platform !== 'darwin' || listenersRegistered) {
      return;
    }

    listenersRegistered = true;
    powerMonitor.on('suspend', onSuspend);
    powerMonitor.on('lock-screen', onLockScreen);
    powerMonitor.on('resume', onResume);
    powerMonitor.on('unlock-screen', onUnlockScreen);
  }

  function shutdown() {
    if (listenersRegistered) {
      powerMonitor.removeListener('suspend', onSuspend);
      powerMonitor.removeListener('lock-screen', onLockScreen);
      powerMonitor.removeListener('resume', onResume);
      powerMonitor.removeListener('unlock-screen', onUnlockScreen);
      listenersRegistered = false;
    }

    stopPowerBlocker();
  }

  return {
    registerPowerMonitorListeners,
    shutdown,
    syncFromSnapshot,
  };
}
