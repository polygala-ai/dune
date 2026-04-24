import fs from 'node:fs/promises';
import path from 'node:path';

import { itemTools } from '@/electron/main/agent-actions/handlers/items';
import type { RegisteredTool, ToolServices } from '@/electron/main/agent-actions/handlers/types';

import type { PRReviewerConfig, PRReviewerState, RepoPRConfig } from './types';

const REQUESTED_LABEL = 'dune-review-requested';
const IN_PROGRESS_LABEL = 'dune-review-in-progress';
const DIFF_LIMIT = 8000;
const BODY_LIMIT = 500;
const PROJECT_ID = '2bqWpDY6';
const USER_AGENT = 'dune-pr-reviewer';

interface GitHubUser {
  login: string;
}

interface GitHubIssuePR {
  html_url: string;
}

interface GitHubIssue {
  body: string | null;
  html_url: string;
  number: number;
  pull_request?: GitHubIssuePR;
  title: string;
  user: GitHubUser | null;
}

interface CreateWorkItemResult {
  itemId?: string;
}

const createItemTool = requireItemTool('workflow.items.create');
const updateItemTool = requireItemTool('workflow.items.update');

/** Polls every configured repository once. */
export async function pollPRReviewer(
  config: PRReviewerConfig,
  services: Omit<ToolServices, 'agentContext'>,
): Promise<void> {
  const state = await readState(config.stateFilePath);

  for (const repoConfig of config.repos) {
    await pollRepo(config, services, state, repoConfig);
  }

  await writeState(config.stateFilePath, state);
}

async function pollRepo(
  config: PRReviewerConfig,
  services: Omit<ToolServices, 'agentContext'>,
  state: PRReviewerState,
  repoConfig: RepoPRConfig,
): Promise<void> {
  const repoKey = createRepoKey(repoConfig);
  const processed = new Set(state.processedPrs[repoKey] ?? []);
  const issues = await listRequestedPRIssues(config.githubToken, repoConfig);

  for (const issue of issues) {
    if (!issue.pull_request || processed.has(issue.number)) {
      continue;
    }

    try {
      const diff = await fetchPRDiff(config.githubToken, repoConfig, issue.number);
      await createReviewWorkItem(services, repoConfig, issue, diff);
      processed.add(issue.number);
      state.processedPrs[repoKey] = [...processed].sort((left, right) => left - right);
      await writeState(config.stateFilePath, state);
      await markReviewInProgress(config.githubToken, repoConfig, issue.number);
    } catch (error) {
      console.error(`Failed to create Dune PR review item for ${repoKey}#${issue.number}.`, error);
    }
  }
}

async function createReviewWorkItem(
  services: Omit<ToolServices, 'agentContext'>,
  repoConfig: RepoPRConfig,
  issue: GitHubIssue,
  diff: string,
): Promise<void> {
  const agentContext = {
    agentId: 'dune-pr-reviewer',
    agentName: 'Dune PR Reviewer',
    ipcContainerDir: '',
    ipcHostDir: '',
    projectId: PROJECT_ID,
  };
  const toolServices: ToolServices = { ...services, agentContext };
  const title = `[Review] ${repoConfig.owner}/${repoConfig.repo}#${issue.number}: ${issue.title}`;
  const brief = createReviewBrief(repoConfig, issue, diff);
  const created = await createItemTool.handler(toolServices, {
    brief,
    projectId: PROJECT_ID,
    status: 'ready',
    title,
  }) as CreateWorkItemResult;

  if (!created.itemId) {
    throw new Error('workflow.items.create did not return an itemId.');
  }

  await updateItemTool.handler(toolServices, {
    itemId: created.itemId,
    primaryAgentId: repoConfig.reviewerAgentId,
  });
}

function createReviewBrief(repoConfig: RepoPRConfig, issue: GitHubIssue, diff: string): string {
  const repoName = `${repoConfig.owner}/${repoConfig.repo}`;
  const author = issue.user?.login ?? 'unknown';
  const body = truncate(issue.body ?? '', BODY_LIMIT);

  return [
    `PR: ${issue.html_url}`,
    `Author: ${author}`,
    `Repo: ${repoName}`,
    '',
    '## Description',
    body,
    '',
    `## Diff (truncated to ${DIFF_LIMIT} chars)`,
    truncate(diff, DIFF_LIMIT),
    '',
    '---',
    'Review this PR. Use Codex to read the full diff if needed.',
    'Post a structured review comment on the GitHub PR via:',
    `  gh pr review ${issue.number} --repo ${repoName} --comment --body "{summary}"`,
    'Move this work item to "review" when done.',
  ].join('\n');
}

async function listRequestedPRIssues(
  githubToken: string,
  repoConfig: RepoPRConfig,
): Promise<GitHubIssue[]> {
  const url = githubApiUrl(
    `/repos/${repoConfig.owner}/${repoConfig.repo}/issues`,
    {
      labels: REQUESTED_LABEL,
      per_page: '100',
      state: 'open',
    },
  );
  const response = await githubFetch(githubToken, url);

  return await response.json() as GitHubIssue[];
}

async function fetchPRDiff(
  githubToken: string,
  repoConfig: RepoPRConfig,
  prNumber: number,
): Promise<string> {
  const url = githubApiUrl(`/repos/${repoConfig.owner}/${repoConfig.repo}/pulls/${prNumber}`);
  const response = await githubFetch(githubToken, url, {
    headers: {
      Accept: 'application/vnd.github.v3.diff',
    },
  });

  return response.text();
}

async function markReviewInProgress(
  githubToken: string,
  repoConfig: RepoPRConfig,
  prNumber: number,
): Promise<void> {
  await githubFetch(
    githubToken,
    githubApiUrl(
      `/repos/${repoConfig.owner}/${repoConfig.repo}/issues/${prNumber}/labels/${encodeURIComponent(REQUESTED_LABEL)}`,
    ),
    { method: 'DELETE' },
    { allowNotFound: true },
  );
  await githubFetch(
    githubToken,
    githubApiUrl(`/repos/${repoConfig.owner}/${repoConfig.repo}/issues/${prNumber}/labels`),
    {
      body: JSON.stringify({ labels: [IN_PROGRESS_LABEL] }),
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'POST',
    },
  );
}

async function githubFetch(
  githubToken: string,
  url: string,
  init: RequestInit = {},
  options: { allowNotFound?: boolean } = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${githubToken}`);
  headers.set('User-Agent', USER_AGENT);
  headers.set('X-GitHub-Api-Version', '2022-11-28');

  if (!headers.has('Accept')) {
    headers.set('Accept', 'application/vnd.github+json');
  }

  const response = await fetch(url, { ...init, headers });

  if (options.allowNotFound && response.status === 404) {
    return response;
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`GitHub API request failed: ${response.status} ${response.statusText} ${body}`);
  }

  return response;
}

async function readState(stateFilePath: string): Promise<PRReviewerState> {
  try {
    const raw = await fs.readFile(stateFilePath, 'utf8');
    const parsed = JSON.parse(raw) as Partial<PRReviewerState>;

    if (!parsed.processedPrs || typeof parsed.processedPrs !== 'object') {
      return createEmptyState();
    }

    return {
      processedPrs: Object.fromEntries(
        Object.entries(parsed.processedPrs).map(([repoKey, values]) => [
          repoKey,
          Array.isArray(values)
            ? values.filter((value): value is number => Number.isInteger(value))
            : [],
        ]),
      ),
    };
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') {
      await writeState(stateFilePath, createEmptyState());
      return createEmptyState();
    }

    throw error;
  }
}

async function writeState(stateFilePath: string, state: PRReviewerState): Promise<void> {
  await fs.mkdir(path.dirname(stateFilePath), { recursive: true });
  await fs.writeFile(stateFilePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

function createEmptyState(): PRReviewerState {
  return { processedPrs: {} };
}

function createRepoKey(repoConfig: RepoPRConfig): string {
  return `${repoConfig.owner}/${repoConfig.repo}`;
}

function githubApiUrl(route: string, searchParams?: Record<string, string>): string {
  const url = new URL(`https://api.github.com${route}`);

  for (const [key, value] of Object.entries(searchParams ?? {})) {
    url.searchParams.set(key, value);
  }

  return url.toString();
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  return value.slice(0, maxLength);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}

function requireItemTool(name: string): RegisteredTool {
  const tool = itemTools.find((candidate) => candidate.definition.name === name);

  if (!tool) {
    throw new Error(`PR reviewer could not find ${name} action handler.`);
  }

  return tool;
}
