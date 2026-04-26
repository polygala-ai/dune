import path from 'node:path';
import type { App } from 'electron';

import type { PrReviewerPollerServices } from '@/electron/main/pr-reviewer/poller';
import { pollPrReviewer } from '@/electron/main/pr-reviewer/poller';

const POLL_INTERVAL_MS = 5 * 60 * 1_000;

const REPOS = [
  { owner: 'polygala-ai', repo: 'dune', reviewerAgentId: 'Mg_8MMfk' },
  { owner: 'boxlite-ai', repo: 'agentlite', reviewerAgentId: 'IaAuvT2t' },
];

export interface PrReviewerActionRegistry extends PrReviewerPollerServices {
  app: Pick<App, 'getPath'>;
  ensureRuntime: () => Promise<void>;
  registerAction?: (name: 'pr_reviewer_poll', handler: () => Promise<void>) => void;
}

export interface PrReviewerController {
  poll: () => Promise<void>;
  stop: () => void;
}

export function startPrReviewer(actionRegistry: PrReviewerActionRegistry): PrReviewerController {
  const githubToken = process.env.GITHUB_TOKEN;
  const stateFilePath = path.join(actionRegistry.app.getPath('userData'), 'pr-reviewer-state.json');
  let running = false;

  const poll = async () => {
    if (!githubToken) {
      console.warn('PR reviewer is disabled because GITHUB_TOKEN is not set.');
      return;
    }

    if (running) {
      return;
    }

    running = true;
    try {
      await actionRegistry.ensureRuntime();
      await pollPrReviewer(
        {
          githubToken,
          repos: REPOS,
          stateFilePath,
        },
        {
          getRuntimeController: actionRegistry.getRuntimeController,
          onWorkflowChanged: actionRegistry.onWorkflowChanged,
          workflowStore: actionRegistry.workflowStore,
        },
      );
    } catch (error) {
      console.error('PR reviewer poll failed.', error);
    } finally {
      running = false;
    }
  };

  actionRegistry.registerAction?.('pr_reviewer_poll', poll);

  const interval = githubToken
    ? setInterval(() => {
      void poll();
    }, POLL_INTERVAL_MS)
    : null;

  if (githubToken) {
    void poll();
  }

  return {
    poll,
    stop: () => {
      if (interval) {
        clearInterval(interval);
      }
    },
  };
}
