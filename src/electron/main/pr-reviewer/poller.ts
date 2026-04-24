import fs from 'node:fs/promises';
import path from 'node:path';

import { itemTools } from '@/electron/main/agent-actions/handlers/items';
import type { RegisteredTool, ToolServices } from '@/electron/main/agent-actions/handlers/types';
import type { AppStorage } from '@/electron/main/storage';
import type { DesktopRuntimeController } from '@/electron/main/runtime/desktop-runtime-controller';

const REVIEW_REQUESTED_LABEL = 'dune-review-requested';
const REVIEW_IN_PROGRESS_LABEL = 'dune-review-in-progress';
const MAX_DIFF_CHARS = 8_000;
const MAX_BODY_CHARS = 500;

interface PullRequestLabel {
  name?: string;
}

interface PullRequestUser {
  login: string;
}

interface PullRequestSummary {
  body: string | null;
  html_url: string;
  labels: PullRequestLabel[];
  number: number;
  title: string;
  user: PullRequestUser | null;
}

interface ProcessedPrState {
  processedPrs: Record<string, number[]>;
}

export interface PrReviewerRepoConfig {
  owner: string;
  repo: string;
  reviewerAgentId: string;
}

export interface PrReviewerPollerConfig {
  githubToken: string;
  repos: PrReviewerRepoConfig[];
  stateFilePath: string;
}

export interface PrReviewerPollerServices {
  getRuntimeController: () => DesktopRuntimeController;
  onWorkflowChanged: () => void;
  workflowStore: AppStorage;
}

interface GithubRequestOptions {
  accept?: string;
  body?: unknown;
  method?: string;
}

function requireItemHandler(toolName: string): RegisteredTool['handler'] {
  const handler = itemTools.find((tool) => tool.definition.name === toolName)?.handler;

  if (!handler) {
    throw new Error(`PR reviewer could not find ${toolName} action handler.`);
  }

  return handler;
}

const createItemHandler = requireItemHandler('workflow.items.create');
const updateItemHandler = requireItemHandler('workflow.items.update');

async function readState(stateFilePath: string): Promise<ProcessedPrState> {
  try {
    const raw = await fs.readFile(stateFilePath, 'utf8');
    const parsed = JSON.parse(raw) as Partial<ProcessedPrState>;

    return {
      processedPrs: parsed.processedPrs && typeof parsed.processedPrs === 'object'
        ? Object.fromEntries(
          Object.entries(parsed.processedPrs).map(([repoKey, numbers]) => [
            repoKey,
            Array.isArray(numbers)
              ? numbers.filter((number): number is number => Number.isInteger(number))
              : [],
          ]),
        )
        : {},
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { processedPrs: {} };
    }

    throw error;
  }
}

async function writeState(stateFilePath: string, state: ProcessedPrState): Promise<void> {
  await fs.mkdir(path.dirname(stateFilePath), { recursive: true });
  await fs.writeFile(stateFilePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

async function githubRequest(
  token: string,
  url: string,
  options: GithubRequestOptions = {},
): Promise<Response> {
  const headers: Record<string, string> = {
    Accept: options.accept ?? 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'User-Agent': 'dune-pr-reviewer',
    'X-GitHub-Api-Version': '2022-11-28',
  };

  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(`https://api.github.com${url}`, {
    headers,
    method: options.method ?? 'GET',
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`GitHub ${options.method ?? 'GET'} ${url} failed: ${response.status} ${body}`);
  }

  return response;
}

async function fetchOpenPullRequests(
  token: string,
  repoConfig: PrReviewerRepoConfig,
): Promise<PullRequestSummary[]> {
  const response = await githubRequest(
    token,
    `/repos/${repoConfig.owner}/${repoConfig.repo}/pulls?state=open`,
  );

  return await response.json() as PullRequestSummary[];
}

async function fetchPullRequestDiff(
  token: string,
  repoConfig: PrReviewerRepoConfig,
  number: number,
): Promise<string> {
  const response = await githubRequest(
    token,
    `/repos/${repoConfig.owner}/${repoConfig.repo}/pulls/${number}`,
    { accept: 'application/vnd.github.v3.diff' },
  );

  return (await response.text()).slice(0, MAX_DIFF_CHARS);
}

async function replaceGithubLabel(
  token: string,
  repoConfig: PrReviewerRepoConfig,
  number: number,
): Promise<void> {
  await githubRequest(
    token,
    `/repos/${repoConfig.owner}/${repoConfig.repo}/issues/${number}/labels/${encodeURIComponent(REVIEW_REQUESTED_LABEL)}`,
    { method: 'DELETE' },
  ).catch((error) => {
    console.warn(`Failed to remove ${REVIEW_REQUESTED_LABEL} from ${repoConfig.owner}/${repoConfig.repo}#${number}.`, error);
  });
  await githubRequest(
    token,
    `/repos/${repoConfig.owner}/${repoConfig.repo}/issues/${number}/labels`,
    {
      body: { labels: [REVIEW_IN_PROGRESS_LABEL] },
      method: 'POST',
    },
  );
}

function hasReviewRequestedLabel(pr: PullRequestSummary): boolean {
  return pr.labels.some((label) => label.name === REVIEW_REQUESTED_LABEL);
}

function buildBrief(repoConfig: PrReviewerRepoConfig, pr: PullRequestSummary, diff: string): string {
  const repoKey = `${repoConfig.owner}/${repoConfig.repo}`;
  const body = (pr.body ?? '').slice(0, MAX_BODY_CHARS);

  return [
    `PR: ${pr.html_url}`,
    `Author: ${pr.user?.login ?? 'unknown'}`,
    `Repo: ${repoKey}`,
    '',
    '## Description',
    body,
    '',
    '## Diff (truncated to 8000 chars)',
    diff,
    '',
    '---',
    'Review this PR. Use Codex to read the full diff if needed.',
    'Post a structured review comment on the GitHub PR via:',
    `  gh pr review ${pr.number} --repo ${repoKey} --comment --body "{summary}"`,
    'Move this work item to review when done.',
  ].join('\n');
}

function createToolServices(
  services: PrReviewerPollerServices,
  repoConfig: PrReviewerRepoConfig,
): ToolServices {
  const runtimeSnapshot = services.getRuntimeController().getSnapshot();
  const reviewerAgent = runtimeSnapshot.agents.find((agent) => agent.id === repoConfig.reviewerAgentId);

  if (!reviewerAgent?.projectId) {
    throw new Error(`Reviewer agent ${repoConfig.reviewerAgentId} is not available or has no project.`);
  }

  return {
    agentContext: {
      agentId: reviewerAgent.id,
      agentName: reviewerAgent.name,
      ipcContainerDir: '/workspace/extra/dune/',
      ipcHostDir: '',
      projectId: reviewerAgent.projectId,
    },
    getRuntimeController: services.getRuntimeController,
    onWorkflowChanged: services.onWorkflowChanged,
    workflowStore: services.workflowStore,
  };
}

async function processPullRequest(
  config: PrReviewerPollerConfig,
  services: PrReviewerPollerServices,
  state: ProcessedPrState,
  repoConfig: PrReviewerRepoConfig,
  pr: PullRequestSummary,
): Promise<void> {
  const repoKey = `${repoConfig.owner}/${repoConfig.repo}`;
  const diff = await fetchPullRequestDiff(config.githubToken, repoConfig, pr.number);
  const toolServices = createToolServices(services, repoConfig);
  const title = `[Review] ${repoKey}#${pr.number}: ${pr.title}`;
  const createResult = await createItemHandler(toolServices, {
    brief: buildBrief(repoConfig, pr, diff),
    note: `Dune detected GitHub review request ${repoKey}#${pr.number}.`,
    status: 'ready',
    title,
  }) as { itemId?: unknown };

  if (typeof createResult.itemId !== 'string') {
    throw new Error(`workflow.items.create did not return an itemId for ${repoKey}#${pr.number}.`);
  }

  await updateItemHandler(toolServices, {
    itemId: createResult.itemId,
    note: `Assigned automated PR review for ${repoKey}#${pr.number}.`,
    primaryAgentId: repoConfig.reviewerAgentId,
  });

  state.processedPrs[repoKey] = [
    ...(state.processedPrs[repoKey] ?? []),
    pr.number,
  ];
  await writeState(config.stateFilePath, state);
  await replaceGithubLabel(config.githubToken, repoConfig, pr.number);
}

export async function pollPrReviewer(
  config: PrReviewerPollerConfig,
  services: PrReviewerPollerServices,
): Promise<void> {
  const state = await readState(config.stateFilePath);

  for (const repoConfig of config.repos) {
    const repoKey = `${repoConfig.owner}/${repoConfig.repo}`;
    const processed = new Set(state.processedPrs[repoKey] ?? []);
    const prs = await fetchOpenPullRequests(config.githubToken, repoConfig);

    for (const pr of prs) {
      if (!hasReviewRequestedLabel(pr) || processed.has(pr.number)) {
        continue;
      }

      await processPullRequest(config, services, state, repoConfig, pr);
      processed.add(pr.number);
    }
  }
}
