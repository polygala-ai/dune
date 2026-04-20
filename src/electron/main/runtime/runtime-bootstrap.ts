// Lazy runtime creation and snapshot fanout wiring.

import path from 'node:path';
import type { App } from 'electron';

import type { DesktopRuntimeController } from '@/electron/main/runtime/desktop-runtime-controller';
import type { AppStorage } from '@/electron/main/storage';
import type { AgentServiceSnapshot } from '@/shared/agents/agent-runtime';

interface RuntimeBootstrapOptions {
  agentLiteHomeDir?: string;
  agentStore: AppStorage;
  app: Pick<App, 'getAppPath'>;
  onAgentIdle: (agentId: string) => void;
  onItemActivityChanged: (payload: { isWorking: boolean; itemId: string }) => void;
  onRuntimeSnapshot: (snapshot: AgentServiceSnapshot) => void;
  onStarted?: () => void;
  onWorkflowChanged: () => void;
  secretsStore: AppStorage;
  settingsStore: AppStorage;
  workflowStore: AppStorage;
}

/** Creates the lazy runtime bootstrap coordinator. */
export function createRuntimeBootstrap(options: RuntimeBootstrapOptions) {
  let runtimeBootstrapPromise: Promise<void> | null = null;
  let runtimeBootstrapScheduled = false;
  let runtimeBootstrapTimeoutHandle: ReturnType<typeof globalThis.setTimeout> | null = null;
  let runtimeController: DesktopRuntimeController | null = null;

  function requireRuntimeController() {
    if (!runtimeController) {
      throw new Error('Runtime controller is unavailable.');
    }

    return runtimeController;
  }

  const ensureRuntime = () => {
    if (runtimeBootstrapPromise) {
      return runtimeBootstrapPromise;
    }

    runtimeBootstrapPromise = Promise.all([
      import('@/electron/main/runtime/desktop-runtime-controller'),
      import('@/renderer/features/settings/model/model-providers'),
      import('@/renderer/features/settings/model/telegram-channel'),
    ]).then(async ([
      runtimeControllerModule,
      modelProvidersModule,
      telegramChannelModule,
    ]) => {
      void telegramChannelModule;
      const { DesktopRuntimeController } = runtimeControllerModule;
      const {
        loadModelProviders,
        resolveDefaultModelCredentials,
      } = modelProvidersModule;

      runtimeController = new DesktopRuntimeController({
        actionServices: {
          getRuntimeController: requireRuntimeController,
          onWorkflowChanged: options.onWorkflowChanged,
          workflowStore: options.workflowStore,
        },
        agentStore: options.agentStore,
        bundledAgentDir: path.join(options.app.getAppPath(), 'agent'),
        ...(options.agentLiteHomeDir ? { homeDir: options.agentLiteHomeDir } : {}),
        onAgentIdle: options.onAgentIdle,
        onItemActivityChanged: options.onItemActivityChanged,
        resolveModelCredentials: () => resolveDefaultModelCredentials({
          secretsStore: options.secretsStore,
          settingsStore: options.settingsStore,
        }),
        resolveProjectName: async (projectId) => {
          const snapshot = await options.workflowStore.get<{
            projects?: Array<{ id: string; name: string; rootPath?: string | null }>;
          }>('snapshot');

          return snapshot?.projects?.find((project) => project.id === projectId)?.name ?? null;
        },
        resolveProjectRootPath: async (projectId) => {
          const snapshot = await options.workflowStore.get<{
            projects?: Array<{ id: string; name: string; rootPath?: string | null }>;
          }>('snapshot');

          return snapshot?.projects?.find((project) => project.id === projectId)?.rootPath ?? null;
        },
        telegramSecretsStore: options.secretsStore,
      });

      runtimeController.subscribe((snapshot) => {
        options.onRuntimeSnapshot(snapshot);
      });

      await loadModelProviders({
        secretsStore: options.secretsStore,
        settingsStore: options.settingsStore,
      });
      await runtimeController.start();
      options.onStarted?.();
    }).catch((error) => {
      console.error('Failed to bootstrap the Dune runtime.', error);
      throw error;
    });

    return runtimeBootstrapPromise;
  };

  const scheduleRuntimeBootstrap = (delayMs: number) => {
    if (runtimeController || runtimeBootstrapScheduled) {
      return;
    }

    runtimeBootstrapScheduled = true;
    runtimeBootstrapTimeoutHandle = setTimeout(() => {
      runtimeBootstrapTimeoutHandle = null;
      void ensureRuntime();
    }, delayMs);
  };

  const shutdown = async () => {
    if (runtimeBootstrapTimeoutHandle) {
      clearTimeout(runtimeBootstrapTimeoutHandle);
      runtimeBootstrapTimeoutHandle = null;
    }

    await runtimeController?.shutdown();
  };

  return {
    ensureRuntime,
    requireRuntimeController,
    scheduleRuntimeBootstrap,
    shutdown,
  };
}
