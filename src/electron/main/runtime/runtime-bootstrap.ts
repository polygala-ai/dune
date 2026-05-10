// Lazy runtime creation and snapshot fanout wiring.

import path from 'node:path';
import type { App } from 'electron';

import type { DesktopRuntimeController } from '@/electron/main/runtime/desktop-runtime-controller';
import type { SecretsRepository } from '@/electron/main/persistence/secrets-repository';
import type { DrizzleSettingsRepository } from '@/electron/main/persistence/settings-repository';
import type { WorkflowSnapshotStore } from '@/electron/main/persistence/workflow-repository';
import type { AgentStore } from '@/electron/main/runtime/agent-runtime';
import type { AgentServiceSnapshot } from '@/shared/agents/agent-runtime';
import {
  getAgentLiteBackendOptions,
  getEnabledCodingEngineIds,
} from '@/renderer/features/settings/model/coding-engine-settings';

interface RuntimeBootstrapOptions {
  agentLiteHomeDir?: string;
  agentStore: AgentStore;
  app: Pick<App, 'getAppPath'>;
  onAgentIdle: (agentId: string) => void;
  onItemActivityChanged: (payload: { isWorking: boolean; itemId: string }) => void;
  onRuntimeSnapshot: (snapshot: AgentServiceSnapshot) => void;
  onStarted?: () => void;
  onWorkflowChanged: () => void;
  secretsStore: SecretsRepository;
  settingsRepository: DrizzleSettingsRepository;
  workflowStore: WorkflowSnapshotStore;
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
    ]).then(async ([
      runtimeControllerModule,
    ]) => {
      const { DesktopRuntimeController } = runtimeControllerModule;

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
        loadAgentBackendOptions: async () =>
          getAgentLiteBackendOptions(await options.settingsRepository.loadCodingEngineSettings()),
        loadEnabledCodingEngineIds: async () =>
          getEnabledCodingEngineIds(await options.settingsRepository.loadCodingEngineSettings()),
        resolveModelCredentials: () => options.settingsRepository.resolveDefaultModelCredentials(),
        resolveProjectName: async (projectId) => {
          const snapshot = await options.workflowStore.readSnapshot();

          return snapshot?.projects?.find((project) => project.id === projectId)?.name ?? null;
        },
        resolveProjectRootPath: async (projectId) => {
          const snapshot = await options.workflowStore.readSnapshot();

          return snapshot?.projects?.find((project) => project.id === projectId)?.rootPath ?? null;
        },
        telegramSecretsStore: options.secretsStore,
      });

      runtimeController.subscribe((snapshot) => {
        options.onRuntimeSnapshot(snapshot);
      });

      await options.settingsRepository.loadModelProviders();
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
