import type { ToolServices } from '@/electron/main/agent-actions/handlers/types';

import { pollPRReviewer } from './poller';
import type { PRReviewerConfig } from './types';

/** Starts the automated PR reviewer poller. */
export function startPRReviewer(
  config: PRReviewerConfig,
  services: Omit<ToolServices, 'agentContext'>,
): () => void {
  let isPolling = false;

  const run = () => {
    if (isPolling) {
      return;
    }

    isPolling = true;
    void pollPRReviewer(config, services)
      .catch((error) => {
        console.error('Automated PR reviewer poll failed.', error);
      })
      .finally(() => {
        isPolling = false;
      });
  };

  run();
  const intervalHandle = setInterval(run, config.pollIntervalMs);

  return () => {
    clearInterval(intervalHandle);
  };
}
