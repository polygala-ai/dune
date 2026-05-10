// App quit coordination.

/** App lifecycle contract used by the quit coordinator. */
export interface QuitCoordinatorApp {
  quit: () => void;
  relaunch: () => void;
}

/** Quit coordinator event shape. */
export interface QuitCoordinatorEvent {
  preventDefault: () => void;
}

/** Quit coordinator options. */
export interface QuitCoordinatorOptions {
  app: QuitCoordinatorApp;
  onShutdownError?: (error: unknown) => void;
  shutdownRuntime: () => Promise<void> | void;
}

/** Creates quit coordinator. */
export function createQuitCoordinator({
  app,
  onShutdownError,
  shutdownRuntime,
}: QuitCoordinatorOptions) {
  let allowsQuit = false;
  let isQuitRequested = false;
  let isRestartRequested = false;
  let shutdownPromise: Promise<void> | null = null;

  /** Ensures shutdown. */
  const ensureShutdown = () => {
    if (shutdownPromise) {
      return shutdownPromise;
    }

    shutdownPromise = (async () => {
      await shutdownRuntime();
    })();

    return shutdownPromise;
  };

  const requestQuit = () => {
    if (allowsQuit || isQuitRequested) {
      return;
    }

    isQuitRequested = true;

    void ensureShutdown()
      .catch((error) => {
        onShutdownError?.(error);
      })
      .finally(() => {
        allowsQuit = true;
        app.quit();
      });
  };

  return {
    handleBeforeQuit: (event: QuitCoordinatorEvent) => {
      if (allowsQuit) {
        return;
      }

      event.preventDefault();
      requestQuit();
    },
    restart: () => {
      if (isRestartRequested) {
        return;
      }

      isRestartRequested = true;
      app.relaunch();
      requestQuit();
    },
  };
}
