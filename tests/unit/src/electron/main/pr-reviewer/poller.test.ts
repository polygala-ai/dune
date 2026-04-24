import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { pollPrReviewer } from '@/electron/main/pr-reviewer/poller';
import type { WorkflowSnapshot } from '@/electron/main/agent-actions/handlers/snapshot';
import { createWorkflowItemActivitySummary } from '@/shared/workflow/activity';

function createSnapshot(): WorkflowSnapshot {
  return {
    items: [],
    projects: [
      {
        color: '#0075ca',
        createdAt: 1,
        description: 'Project',
        id: 'project-1',
        name: 'Project',
        rootPath: null,
        updatedAt: 1,
      },
    ],
    selectedItemId: null,
    selectedProjectFilter: 'all',
    selectedProjectId: 'project-1',
    selectedProjectView: 'board',
  };
}

describe('pollPrReviewer', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('creates and assigns work items for requested PR reviews', async () => {
    let snapshot = createSnapshot();
    const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dune-pr-reviewer-'));
    const stateFilePath = path.join(stateDir, 'state.json');
    const calls: Array<{ body: unknown | undefined; headers: HeadersInit | undefined; method: string; url: string }> = [];
    const diff = 'diff --git a/file.ts b/file.ts\n'.repeat(400);

    vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      calls.push({
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
        headers: init?.headers,
        method,
        url,
      });

      if (url.endsWith('/repos/polygala-ai/dune/pulls?state=open')) {
        return Promise.resolve(new Response(JSON.stringify([
          {
            body: 'Body '.repeat(200),
            html_url: 'https://github.com/polygala-ai/dune/pull/42',
            labels: [{ name: 'dune-review-requested' }],
            number: 42,
            title: 'Improve review flow',
            user: { login: 'octocat' },
          },
        ]), { status: 200 }));
      }

      if (url.endsWith('/repos/polygala-ai/dune/pulls/42')) {
        return Promise.resolve(new Response(diff, { status: 200 }));
      }

      if (url.endsWith('/repos/polygala-ai/dune/issues/42/labels/dune-review-requested')) {
        return Promise.resolve(new Response('', { status: 200 }));
      }

      if (url.endsWith('/repos/polygala-ai/dune/issues/42/labels')) {
        return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
      }

      throw new Error(`Unexpected fetch ${method} ${url}`);
    });

    await pollPrReviewer(
      {
        githubToken: 'token',
        repos: [{ owner: 'polygala-ai', repo: 'dune', reviewerAgentId: 'agent-1' }],
        stateFilePath,
      },
      {
        getRuntimeController: () => ({
          getSnapshot: () => ({
            agents: [
              {
                definition: { archetype: 'worker', responsibilities: [] },
                id: 'agent-1',
                name: 'Reviewer',
                projectId: 'project-1',
                status: 'ready',
                updatedAt: 1,
              },
            ],
          }),
        }) as never,
        onWorkflowChanged: () => undefined,
        workflowStore: {
          delete: () => Promise.resolve(),
          get: <T,>(key: string) => Promise.resolve(key === 'snapshot' ? structuredClone(snapshot) as T : null),
          keys: () => Promise.resolve(['snapshot']),
          set: <T,>(key: string, value: T) => {
            if (key === 'snapshot') {
              snapshot = structuredClone(value as WorkflowSnapshot);
              for (const item of snapshot.items) {
                item.activity = createWorkflowItemActivitySummary(item.activity);
              }
            }

            return Promise.resolve();
          },
        },
      },
    );

    expect(snapshot.items).toHaveLength(1);
    expect(snapshot.items[0]?.title).toBe('[Review] polygala-ai/dune#42: Improve review flow');
    expect(snapshot.items[0]?.primaryAgentId).toBe('agent-1');
    expect(snapshot.items[0]?.status).toBe('ready');
    expect(snapshot.items[0]?.brief).toContain('PR: https://github.com/polygala-ai/dune/pull/42');
    expect(snapshot.items[0]?.brief).toContain('gh pr review 42 --repo polygala-ai/dune');
    expect(snapshot.items[0]?.brief.length).toBeLessThan(diff.length);
    await expect(fs.readFile(stateFilePath, 'utf8')).resolves.toContain('"polygala-ai/dune": [');
    expect(calls.some((call) => call.method === 'DELETE')).toBe(true);
    expect(calls.some((call) =>
      call.method === 'POST'
      && JSON.stringify(call.body).includes('dune-review-in-progress'))).toBe(true);
  });
});
