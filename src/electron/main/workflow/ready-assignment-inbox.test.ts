import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import type { Agent } from '@/renderer/features/agents/types';
import { READY_ASSIGNMENTS_INBOX_FILENAME } from '@/shared/agents/ready-assignments';
import {
  syncReadyAssignmentInboxSnapshots,
  type ReadyAssignmentsWorkflowSnapshot,
} from '@/electron/main/workflow/ready-assignment-inbox';
import {
  resolveAgentDuneDir,
  resolveProjectDuneDir,
} from '@/electron/main/agent-ipc/ipc-directory';

const tempDirs: string[] = [];

function createAgent(overrides: Partial<Agent> = {}): Agent {
  return {
    channel: {
      canCompose: true,
      id: 'dune-chat',
      kind: 'built-in',
      label: 'Dune Chat',
      status: 'ready',
    },
    activityEvents: [],
    codingEngineEvents: [],
    contextCards: [],
    id: 'agent-1',
    messages: [],
    name: 'Navigator',
    note: '',
    preview: '',
    projectId: 'proj-1',
    role: 'custom',
    status: 'ready',
    telegram: null,
    updatedAt: 1,
    workspace: 'AgentLite agent',
    ...overrides,
  };
}

function createSnapshot(readyItems: Array<{
  id: string;
  primaryAgentId?: string | null;
  sortOrder: number;
  title: string;
  updatedAt: number;
}>): ReadyAssignmentsWorkflowSnapshot {
  return {
    items: [
      ...readyItems.map((item) => ({
        artifactFolderName: `${item.title.toLowerCase().replace(/\s+/g, '-')}-abcd1234`,
        brief: `Brief for ${item.title}`,
        id: item.id,
        primaryAgentId: item.primaryAgentId ?? 'agent-1',
        projectId: 'proj-1',
        sortOrder: item.sortOrder,
        status: 'ready',
        tasks: [
          {
            id: `task-${item.id}`,
            notes: 'Handle retries.',
            status: 'todo',
            title: `Do ${item.title}`,
          },
        ],
        title: item.title,
        updatedAt: item.updatedAt,
      })),
      {
        artifactFolderName: 'task-b-abcd1234',
        brief: 'Already in progress.',
        id: 'item-active',
        primaryAgentId: 'agent-1',
        projectId: 'proj-1',
        sortOrder: 1,
        status: 'active',
        tasks: [],
        title: 'Task B',
        updatedAt: 9,
      },
    ],
    projects: [
      {
        id: 'proj-1',
        name: 'Project One',
        rootPath: '/tmp/project-one',
      },
    ],
  };
}

describe('ready-assignment-inbox', () => {
  afterEach(() => {
    while (tempDirs.length > 0) {
      const tempDir = tempDirs.pop();

      if (tempDir) {
        fs.rmSync(tempDir, { force: true, recursive: true });
      }
    }
  });

  it('writes a per-agent inbox with generation and item count', () => {
    const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dune-ready-inbox-'));
    const agent = createAgent();
    const agentDir = resolveAgentDuneDir(homeDir, 'proj-1', 'Project One', agent.name, agent.id);
    const projectMainDir = resolveProjectDuneDir(homeDir, 'proj-1', 'Project One');

    tempDirs.push(homeDir);
    fs.mkdirSync(agentDir, { recursive: true });
    fs.mkdirSync(projectMainDir, { recursive: true });

    const result = syncReadyAssignmentInboxSnapshots({
      agents: [
        agent,
        createAgent({
          id: 'agent-main',
          name: 'Project Main',
          role: 'project-main',
        }),
      ],
      homeDir,
      now: () => 123,
      snapshot: createSnapshot([
        { id: 'item-1', sortOrder: 0, title: 'Task A', updatedAt: 10 },
      ]),
    });

    const agentInboxPath = path.join(agentDir, 'inbox', READY_ASSIGNMENTS_INBOX_FILENAME);
    const projectMainInboxPath = path.join(projectMainDir, 'inbox', READY_ASSIGNMENTS_INBOX_FILENAME);
    const agentInbox = JSON.parse(fs.readFileSync(agentInboxPath, 'utf-8')) as {
      generatedAt: number;
      generation: number;
      itemCount: number;
      items: Array<Record<string, unknown>>;
    };
    const projectMainInbox = JSON.parse(fs.readFileSync(projectMainInboxPath, 'utf-8')) as {
      itemCount: number;
      items: Array<Record<string, unknown>>;
    };

    expect(agentInbox.generatedAt).toBe(123);
    expect(agentInbox.generation).toBe(1);
    expect(agentInbox.itemCount).toBe(1);
    expect(agentInbox.items).toEqual([
      {
        artifactPath: '/workspace/extra/project/task-a-abcd1234',
        brief: 'Brief for Task A',
        itemId: 'item-1',
        projectId: 'proj-1',
        projectName: 'Project One',
        sortOrder: 0,
        status: 'ready',
        tasks: [
          {
            id: 'task-item-1',
            notes: 'Handle retries.',
            status: 'todo',
            title: 'Do Task A',
          },
        ],
        title: 'Task A',
        updatedAt: 10,
      },
    ]);
    expect(projectMainInbox.itemCount).toBe(0);
    expect(projectMainInbox.items).toEqual([]);
    expect(result.updates).toEqual([
      {
        agentId: 'agent-1',
        generation: 1,
        itemCount: 1,
        shouldWake: true,
      },
      {
        agentId: 'agent-main',
        generation: 1,
        itemCount: 0,
        shouldWake: false,
      },
    ]);
  });

  it('does not wake on removal-only queue changes', () => {
    const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dune-ready-inbox-'));

    tempDirs.push(homeDir);

    const first = syncReadyAssignmentInboxSnapshots({
      agents: [createAgent()],
      homeDir,
      now: () => 100,
      snapshot: createSnapshot([
        { id: 'item-1', sortOrder: 0, title: 'Task A', updatedAt: 10 },
        { id: 'item-2', sortOrder: 1, title: 'Task C', updatedAt: 9 },
      ]),
    });

    const second = syncReadyAssignmentInboxSnapshots({
      agents: [createAgent()],
      homeDir,
      now: () => 200,
      snapshot: createSnapshot([
        { id: 'item-2', sortOrder: 1, title: 'Task C', updatedAt: 9 },
      ]),
      states: first.states,
    });

    expect(second.updates).toEqual([
      {
        agentId: 'agent-1',
        generation: 2,
        itemCount: 1,
        shouldWake: false,
      },
    ]);
  });

  it('wakes when the ready queue is reordered', () => {
    const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dune-ready-inbox-'));

    tempDirs.push(homeDir);

    const first = syncReadyAssignmentInboxSnapshots({
      agents: [createAgent()],
      homeDir,
      snapshot: createSnapshot([
        { id: 'item-1', sortOrder: 0, title: 'Task A', updatedAt: 10 },
        { id: 'item-2', sortOrder: 1, title: 'Task C', updatedAt: 9 },
      ]),
    });

    const second = syncReadyAssignmentInboxSnapshots({
      agents: [createAgent()],
      homeDir,
      snapshot: createSnapshot([
        { id: 'item-2', sortOrder: 0, title: 'Task C', updatedAt: 11 },
        { id: 'item-1', sortOrder: 1, title: 'Task A', updatedAt: 10 },
      ]),
      states: first.states,
    });

    expect(second.updates).toEqual([
      {
        agentId: 'agent-1',
        generation: 2,
        itemCount: 2,
        shouldWake: true,
      },
    ]);
  });

  it('does not wake for an empty queue', () => {
    const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dune-ready-inbox-'));

    tempDirs.push(homeDir);

    const result = syncReadyAssignmentInboxSnapshots({
      agents: [createAgent()],
      homeDir,
      snapshot: createSnapshot([]),
    });

    expect(result.updates).toEqual([
      {
        agentId: 'agent-1',
        generation: 1,
        itemCount: 0,
        shouldWake: false,
      },
    ]);
  });
});
