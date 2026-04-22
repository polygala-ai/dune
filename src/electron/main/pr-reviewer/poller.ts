// PR Reviewer Poller — periodically checks GitHub for PRs needing review,
// creates Dune work items, assigns them to the correct reviewer agent, and
// updates GitHub labels to track progress.

import fs from 'node:fs/promises';
import path from 'node:path';

import { createId } from '@/shared/id';
import { createArtifactFolderName } from '@/shared/workflow/project-artifacts';
import { createWorkflowItemActivitySummary } from '@/shared/workflow/activity';
import type { AppStorage } from '@/electron/main/storage/app-storage';
import type { WorkflowSnapshot } from '@/electron/main/agent-actions/handlers/snapshot';

/** A single watched GitHub repo and its reviewer agent. */
export interface RepoConfig {
  owner: string;
  repo: string;
  reviewerAgentId: string;
}

/** Config passed to pollPrs. */
export interface PrReviewerPollerConfig {
  repos: RepoConfig[];
  githubToken: string;
  stateFilePath: string;
}

interface PrReviewerState {
  processedPrs: Record<string, number[]>;
}

interface GitHubPr {
  number: number;
  title: string;
  html_url: string;
  user: { login: string };
  body: string | null;
  labels: Array<{ name: string }>;
}

const LABEL_REQUESTED = 'dune-review-requested';
const LABEL_IN_PROGRESS = 'dune-review-in-progress';
const MAX_DIFF_CHARS = 8000;
const MAX_BODY_CHARS = 500;

async function githubFetch(
  token: string,
  url: string,
  options?: { accept?: string; method?: string; body?: unknown },
): Promise<Response> {
  const headers: Record<string, string> = {
    'Accept': options?.accept ?? 'application/vnd.github+json',
    'Authorization': `Bearer ${token}`,
    'X-GitHub-Api-Version': '2022-11-28',
  };

  if (options?.body) {
    headers['Content-Type'] = 'application/json';
  }

  return fetch(url, {
    method: options?.method ?? 'GET',
    headers,
    body: options?.body ? JSON.stringify(options.body) : undefined,
  });
}

async function loadState(stateFilePath: string): Promise<PrReviewerState> {
  try {
    const raw = await fs.readFile(stateFilePath, 'utf8');
    const parsed = JSON.parse(raw) as unknown;

    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'processedPrs' in parsed &&
      typeof (parsed as Record<string, unknown>).processedPrs === 'object'
    ) {
      return parsed as PrReviewerState;
    }
  } catch {
    // File doesn't exist or is corrupt — start fresh.
  }

  return { processedPrs: {} };
}

async function saveState(stateFilePath: string, state: PrReviewerState): Promise<void> {
  await fs.mkdir(path.dirname(stateFilePath), { recursive: true });
  await fs.writeFile(stateFilePath, JSON.stringify(state, null, 2), 'utf8');
}

async function ensureLabelsExist(token: string, owner: string, repo: string): Promise<void> {
  const labelsToCreate = [
    { name: LABEL_REQUESTED, color: 'e11d48', description: 'PR queued for Dune agent review' },
    { name: LABEL_IN_PROGRESS, color: 'f97316', description: 'Dune agent review is in progress' },
  ];

  for (const label of labelsToCreate) {
    const checkUrl = `https://api.github.com/repos/${owner}/${repo}/labels/${encodeURIComponent(label.name)}`;
    const check = await githubFetch(token, checkUrl);

    if (!check.ok) {
      await githubFetch(token, `https://api.github.com/repos/${owner}/${repo}/labels`, {
        method: 'POST',
        body: label,
      });
    }
  }
}

async function fetchOpenPrsWithLabel(
  token: string,
  owner: string,
  repo: string,
): Promise<GitHubPr[]> {
  const url = `https://api.github.com/repos/${owner}/${repo}/pulls?state=open&per_page=100`;
  const res = await githubFetch(token, url);

  if (!res.ok) {
    console.warn(`[pr-reviewer] Failed to fetch PRs for ${owner}/${repo}: HTTP ${res.status}`);
    return [];
  }

  const prs = (await res.json()) as GitHubPr[];
  return prs.filter((pr) => pr.labels.some((l) => l.name === LABEL_REQUESTED));
}

async function fetchPrDiff(
  token: string,
  owner: string,
  repo: string,
  prNumber: number,
): Promise<string> {
  const url = `https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}`;
  const res = await githubFetch(token, url, {
    accept: 'application/vnd.github.v3.diff',
  });

  if (!res.ok) {
    return '(diff unavailable)';
  }

  const diff = await res.text();
  return diff.length > MAX_DIFF_CHARS
    ? diff.slice(0, MAX_DIFF_CHARS) + '\n... (truncated — use Codex to read the full diff)'
    : diff;
}

async function updatePrLabel(
  token: string,
  owner: string,
  repo: string,
  prNumber: number,
): Promise<void> {
  // Remove the "requested" label.
  await githubFetch(
    token,
    `https://api.github.com/repos/${owner}/${repo}/issues/${prNumber}/labels/${encodeURIComponent(LABEL_REQUESTED)}`,
    { method: 'DELETE' },
  );

  // Add the "in-progress" label.
  await githubFetch(
    token,
    `https://api.github.com/repos/${owner}/${repo}/issues/${prNumber}/labels`,
    { method: 'POST', body: { labels: [LABEL_IN_PROGRESS] } },
  );
}

/**
 * One polling cycle. Checks all configured repos for new PRs with the
 * `dune-review-requested` label, creates Dune work items for each, assigns
 * them to the correct reviewer agent, and updates labels on GitHub.
 */
export async function pollPrs(
  config: PrReviewerPollerConfig,
  workflowStore: AppStorage,
  notifyWorkflowChanged: () => void,
): Promise<void> {
  if (!config.githubToken) {
    console.warn('[pr-reviewer] No GITHUB_TOKEN set — skipping poll.');
    return;
  }

  const state = await loadState(config.stateFilePath);
  let anyCreated = false;

  for (const { owner, repo, reviewerAgentId } of config.repos) {
    const repoKey = `${owner}/${repo}`;
    const processedNums = new Set(state.processedPrs[repoKey] ?? []);

    let prs: GitHubPr[];

    try {
      await ensureLabelsExist(config.githubToken, owner, repo);
      prs = await fetchOpenPrsWithLabel(config.githubToken, owner, repo);
    } catch (error) {
      console.error(`[pr-reviewer] Error polling ${repoKey}:`, error);
      continue;
    }

    const newPrs = prs.filter((pr) => !processedNums.has(pr.number));

    if (newPrs.length === 0) {
      continue;
    }

    // Load the snapshot once we know there are new PRs for this repo.
    const snapshot = await workflowStore.get<WorkflowSnapshot>('snapshot');

    if (!snapshot || !Array.isArray(snapshot.items) || !Array.isArray(snapshot.projects)) {
      console.warn('[pr-reviewer] No workflow snapshot found — skipping.');
      continue;
    }

    // Use the first project as the target (Dune is currently single-project).
    const projectId = snapshot.projects[0]?.id;

    if (!projectId) {
      console.warn('[pr-reviewer] No projects in snapshot — skipping.');
      continue;
    }

    for (const pr of newPrs) {
      let diff: string;

      try {
        diff = await fetchPrDiff(config.githubToken, owner, repo, pr.number);
      } catch (error) {
        console.error(`[pr-reviewer] Error fetching diff for ${repoKey}#${pr.number}:`, error);
        diff = '(diff fetch failed)';
      }

      const prBody = (pr.body ?? '').slice(0, MAX_BODY_CHARS);
      const now = Date.now();
      const itemId = createId('item');
      const title = `[Review] ${owner}/${repo}#${pr.number}: ${pr.title}`;
      const brief = [
        `PR: ${pr.html_url}`,
        `Author: ${pr.user.login}`,
        `Repo: ${owner}/${repo}`,
        '',
        '## Description',
        prBody || '(no description)',
        '',
        '## Diff (truncated to 8000 chars)',
        diff,
        '',
        '---',
        'Review this PR. Use Codex to read the full diff if needed.',
        `Post a structured review comment: \`gh pr review ${pr.number} --repo ${owner}/${repo} --comment --body "<your review summary>"\``,
        'Move this work item to "review" when done.',
      ].join('\n');

      const artifactFolderName = createArtifactFolderName(title, itemId);
      const newItem = {
        activity: createWorkflowItemActivitySummary({
          archivedEventCount: 0,
          hasOlderEvents: false,
          rollingSummary: null,
          totalEventCount: 1,
        }),
        artifactFolderName,
        brief,
        createdAt: now,
        id: itemId,
        primaryAgentId: reviewerAgentId,
        projectId,
        scheduledTaskId: null,
        sortOrder: 0,
        status: 'inbox',
        tasks: [],
        title,
        updatedAt: now,
        workProducts: [],
        workflowEvents: [
          {
            actor: 'Dune PR Reviewer',
            createdAt: now,
            description: `Auto-created from PR ${repoKey}#${pr.number}: "${pr.title}"`,
            id: createId('event'),
            kind: 'item',
          },
        ],
      };

      snapshot.items.push(newItem);
      processedNums.add(pr.number);
      state.processedPrs[repoKey] = [...processedNums];
      anyCreated = true;

      console.info(`[pr-reviewer] Created work item for ${repoKey}#${pr.number} → ${itemId}`);

      // Update label asynchronously; don't block the main loop.
      void updatePrLabel(config.githubToken, owner, repo, pr.number).catch((error) => {
        console.error(`[pr-reviewer] Failed to update labels for ${repoKey}#${pr.number}:`, error);
      });
    }

    if (anyCreated) {
      await workflowStore.set('snapshot', snapshot);
    }
  }

  if (anyCreated) {
    notifyWorkflowChanged();
    await saveState(config.stateFilePath, state);
  }
}
