export interface QuitCoordinatorApp {
  quit: () => void;
  relaunch: () => void;
}

export interface QuitCoordinatorEvent {
  preventDefault: () => void;
}

export interface QuitCoordinatorOptions {
  app: QuitCoordinatorApp;
  onShutdownError?: (error: unknown) => void;
  shutdownRuntime: () => Promise<void> | void;
}

export function createQuitCoordinator({
  app,
  onShutdownError,
  shutdownRuntime,
}: QuitCoordinatorOptions) {
  let allowsQuit = false;
  let isQuitRequested = false;
  let shutdownPromise: Promise<void> | null = null;

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
      app.relaunch();
      requestQuit();
    },
  };
}
