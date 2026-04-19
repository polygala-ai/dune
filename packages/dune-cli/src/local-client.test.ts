// @vitest-environment node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import type { PersistedAgentRecord } from '@/electron/main/runtime/agent-runtime/records';

import { DuneLocalClient } from './local-client';

const tempDirs: string[] = [];

function createTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dune-cli-local-'));
  tempDirs.push(dir);
  return dir;
}

function createPersistedAgentRecord(
  input: {
    id: string;
    name: string;
    projectId: string;
    updatedAt?: number;
  },
): PersistedAgentRecord {
  const updatedAt = input.updatedAt ?? 1;

  return {
    agent: {
      activityEvents: [],
      channel: {
        canCompose: true,
        id: 'dune-chat',
        kind: 'built-in',
        label: 'Dune chat',
        status: 'ready',
        target: null,
      },
      codingEngineEvents: [],
      contextCards: [],
      definition: {
        archetype: 'custom',
        responsibilities: [],
      },
      id: input.id,
      messages: [],
      name: input.name,
      note: 'Ready for work.',
      preview: 'Ready for work.',
      projectId: input.projectId,
      status: 'ready',
      telegram: null,
      transcript: {
        archivedMessageCount: 0,
        hasOlderMessages: false,
        rollingSummary: null,
        totalMessageCount: 0,
      },
      updatedAt,
      workspace: 'AgentLite agent',
    },
    groupFolder: `${input.name.toLowerCase()}-${input.id}`,
    projectName: 'Alpha',
    projectRootPath: null,
    transcriptArchive: null,
  };
}

function seedFixture() {
  const runtimeHome = createTempDir();
  const userDataDir = path.join(runtimeHome, 'userdata');
  const projectRoot = path.join(runtimeHome, 'project-root');
  fs.mkdirSync(userDataDir, { recursive: true });
  fs.mkdirSync(projectRoot, { recursive: true });

  fs.writeFileSync(
    path.join(userDataDir, 'agents.json'),
    JSON.stringify(
      {
        agents: [
          createPersistedAgentRecord({
            id: 'agent-1',
            name: 'Navigator',
            projectId: 'project-1',
          }),
        ],
        selectedAgentId: 'agent-1',
      },
      null,
      2,
    ),
  );

  fs.writeFileSync(
    path.join(userDataDir, 'workflow.json'),
    JSON.stringify(
      {
        snapshot: {
          items: [
            {
              activity: {
                archivedEventCount: 0,
                hasOlderEvents: false,
                rollingSummary: null,
                totalEventCount: 0,
              },
              artifactFolderName: 'seed-item',
              brief: 'Review the API contract',
              createdAt: 1,
              id: 'item-1',
              primaryAgentId: 'agent-1',
              projectId: 'project-1',
              scheduledTaskId: 'task-assignment-1',
              sortOrder: 0,
              status: 'active',
              tasks: [],
              title: 'Review API contract',
              updatedAt: 1,
              workProducts: [],
              workflowEvents: [],
            },
          ],
          projects: [
            {
              color: '#2563EB',
              createdAt: 1,
              description: 'CLI project',
              id: 'project-1',
              name: 'Alpha',
              rootPath: projectRoot,
              updatedAt: 1,
            },
          ],
          selectedItemId: null,
          selectedProjectFilter: 'all',
          selectedProjectId: 'project-1',
          selectedProjectView: 'board',
        },
      },
      null,
      2,
    ),
  );

  return {
    client: new DuneLocalClient({
      env: { DUNE_AGENTLITE_HOME_DIR: runtimeHome },
      homeDir: runtimeHome,
      userDataDir,
    }),
    projectRoot,
    userDataDir,
  };
}

function readWorkflowSnapshot(userDataDir: string) {
  const parsed = JSON.parse(
    fs.readFileSync(path.join(userDataDir, 'workflow.json'), 'utf-8'),
  ) as {
    snapshot: {
      items: Array<Record<string, unknown>>;
    };
  };

  return parsed.snapshot as {
    items: Array<Record<string, unknown>>;
  };
}

afterEach(() => {
  for (const dir of tempDirs.splice(0, tempDirs.length)) {
    fs.rmSync(dir, { force: true, recursive: true });
  }
});

describe('DuneLocalClient', () => {
  it('creates items in the selected project and prepares the artifact folder', async () => {
    const { client, projectRoot, userDataDir } = seedFixture();
    const createdItem = await client.createItem({
      brief: 'Ship the terminal workflow surface.',
      title: 'Build CLI',
    });

    expect(createdItem.projectName).toBe('Alpha');
    expect(createdItem.status).toBe('inbox');
    expect(fs.existsSync(path.join(projectRoot, 'CLAUDE.md'))).toBe(true);
    expect(fs.existsSync(path.join(projectRoot, createdItem.artifactFolderName))).toBe(true);

    const snapshot = readWorkflowSnapshot(userDataDir);
    expect(snapshot.items).toHaveLength(2);
  });

  it('moves items, clears any scheduled task id, and records feedback history', async () => {
    const { client } = seedFixture();
    const movedItem = await client.moveItem('item-1', 'review');
    expect(movedItem.status).toBe('review');

    const feedbackItem = await client.addFeedback('item-1', 'Needs a clearer acceptance checklist.');
    expect(feedbackItem.status).toBe('review');

    const shownItem = await client.showItem('item-1');
    expect(shownItem.scheduledTaskId).toBeNull();
    expect(shownItem.events[0]?.description).toBe('Needs a clearer acceptance checklist.');
    expect(shownItem.events[0]?.actor).toBe('Dune CLI');
    expect(shownItem.events[1]?.description).toBe('Work item moved to review.');
  });

  it('lists agents with their current assignment', async () => {
    const { client } = seedFixture();
    const agents = await client.listAgents();

    expect(agents).toHaveLength(1);
    expect(agents[0]?.name).toBe('Navigator');
    expect(agents[0]?.currentAssignment).toMatchObject({
      id: 'item-1',
      status: 'active',
      title: 'Review API contract',
    });
  });
});
