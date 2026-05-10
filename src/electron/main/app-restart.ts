// App restart coordination.

/** App restart controller options. */
export interface AppRestartControllerOptions {
  hardRestart: () => void;
  isRendererDevMode: boolean;
  reloadRenderer: () => void;
  restartRuntimeInProcess: () => Promise<void> | void;
}

/** Creates app restart controller. */
export function createAppRestartController({
  hardRestart,
  isRendererDevMode,
  reloadRenderer,
  restartRuntimeInProcess,
}: AppRestartControllerOptions) {
  let inProcessRestartPromise: Promise<void> | null = null;

  return {
    restart: async () => {
      if (!isRendererDevMode) {
        hardRestart();
        return;
      }

      if (!inProcessRestartPromise) {
        inProcessRestartPromise = (async () => {
          await restartRuntimeInProcess();
          reloadRenderer();
        })().finally(() => {
          inProcessRestartPromise = null;
        });
      }

      await inProcessRestartPromise;
    },
  };
}
