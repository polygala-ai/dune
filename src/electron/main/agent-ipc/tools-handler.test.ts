import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import type { AppStorage } from '@/electron/main/storage/app-storage';
import { createToolHandler } from './tools';

function createMemoryStore(initialData: Record<string, unknown> = {}): AppStorage {
  const data = new Map<string, unknown>(Object.entries(initialData));
  return {
    delete: async (key: string) => {
      data.delete(key);
    },
    get: async <T,>(key: string) => (data.get(key) as T) ?? null,
    keys: async () => [...data.keys()],
    set: async <T,>(key: string, value: T) => {
      data.set(key, value);
    },
  };
}

async function flushHandler() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function createRuntimeControllerMock() {
  const snapshot = {
    agents: [
      {
        channel: {
          canCompose: true,
          id: 'dune-chat',
          kind: 'built-in',
          label: 'Dune Chat',
          status: 'ready',
          target: null,
        },
        activityEvents: [],
        codingEngineEvents: [],
        contextCards: [
          {
            body: 'Hidden context',
            eyebrow: 'Private',
            id: 'card-1',
            title: 'Internal card',
          },
        ],
        id: 'agent-1',
        messages: [
          {
            attachments: [],
            content: 'Private transcript',
            createdAt: 1,
            format: 'plain',
            id: 'message-1',
            role: 'assistant',
            status: 'complete',
          },
        ],
        name: 'Navigator',
        note: 'Private note',
        preview: 'Hidden preview',
        projectId: 'proj-1',
        role: 'custom',
        status: 'ready',
        telegram: null,
        updatedAt: 10,
        workspace: 'Workspace A',
      },
      {
        channel: {
          canCompose: true,
          id: 'telegram',
          kind: 'external',
          label: 'Telegram',
          status: 'connected',
          target: {
            channelId: 'telegram',
            jid: 'tg:123',
            kind: 'group',
            name: 'Ops',
          },
        },
        activityEvents: [],
        codingEngineEvents: [],
        contextCards: [],
        id: 'agent-2',
        messages: [
          {
            attachments: [],
            content: 'Other project transcript',
            createdAt: 2,
            format: 'plain',
            id: 'message-2',
            role: 'assistant',
            status: 'complete',
          },
        ],
        name: 'Liet Kynes',
        note: 'Other project note',
        preview: 'Other project preview',
        projectId: 'proj-2',
        role: 'project-main',
        status: 'ready',
        telegram: null,
        updatedAt: 20,
        workspace: 'Workspace B',
      },
    ],
    externalChannels: {},
    isStreaming: true,
    runtimeInfo: {
      mode: 'real',
      status: 'ready',
    },
    selectedAgentId: 'agent-1',
    telegramSetupSessions: [
      {
        agentId: null,
        botUsername: 'helper-bot',
        errorMessage: null,
        id: 'telegram-session-1',
        matchedChat: null,
        pairCode: 'ABC123',
        pairExpiresAt: 1_000,
        pairingStatus: 'idle',
        status: 'not-configured',
      },
    ],
  };

  return {
    createAgent: vi.fn(async () => 'agent-created'),
    deleteAgent: vi.fn(async () => undefined),
    ensureProjectMainAgent: vi.fn(async () => 'agent-main'),
    getSnapshot: vi.fn(() => snapshot),
    sendAgentMessage: vi.fn(async () => undefined),
  };
}

function createWorkflowSnapshot() {
  return {
    items: [
      {
        artifactFolderName: 'task-a-abcd1234',
        brief: '',
        createdAt: 0,
        id: 'item-1',
        primaryAgentId: null,
        projectId: 'proj-1',
        sortOrder: 0,
        status: 'inbox',
        tasks: [],
        title: 'Task A',
        updatedAt: 1,
        workProducts: [],
        workflowEvents: [],
      },
      {
        artifactFolderName: 'task-ready-abcd1234',
        brief: '',
        createdAt: 0,
        id: 'item-ready',
        primaryAgentId: 'agent-ctx',
        projectId: 'proj-1',
        sortOrder: 1,
        status: 'ready',
        tasks: [],
        title: 'Task Ready',
        updatedAt: 2,
        workProducts: [],
        workflowEvents: [],
      },
      {
        artifactFolderName: 'task-ready-two-abcd1234',
        brief: '',
        createdAt: 0,
        id: 'item-ready-2',
        primaryAgentId: 'agent-1',
        projectId: 'proj-1',
        sortOrder: 2,
        status: 'ready',
        tasks: [],
        title: 'Task Ready Two',
        updatedAt: 3,
        workProducts: [],
        workflowEvents: [],
      },
      {
        artifactFolderName: 'task-active-abcd1234',
        brief: '',
        createdAt: 0,
        id: 'item-active',
        primaryAgentId: 'agent-ctx',
        projectId: 'proj-1',
        sortOrder: 0,
        status: 'active',
        tasks: [],
        title: 'Task Active',
        updatedAt: 4,
        workProducts: [],
        workflowEvents: [],
      },
      {
        artifactFolderName: 'task-review-abcd1234',
        brief: '',
        createdAt: 0,
        id: 'item-review',
        primaryAgentId: 'agent-ctx',
        projectId: 'proj-1',
        sortOrder: 0,
        status: 'review',
        tasks: [],
        title: 'Task Review',
        updatedAt: 5,
        workProducts: [],
        workflowEvents: [],
      },
      {
        artifactFolderName: 'task-b-abcd1234',
        brief: '',
        createdAt: 0,
        id: 'item-2',
        primaryAgentId: null,
        projectId: 'proj-2',
        sortOrder: 0,
        status: 'done',
        tasks: [],
        title: 'Task B',
        updatedAt: 1,
        workProducts: [],
        workflowEvents: [],
      },
    ],
    projects: [
      {
        color: '#000',
        createdAt: 0,
        description: '',
        id: 'proj-1',
        name: 'Project One',
        rootPath: null,
        updatedAt: 0,
      },
      {
        color: '#111',
        createdAt: 0,
        description: '',
        id: 'proj-2',
        name: 'Project Two',
        rootPath: null,
        updatedAt: 0,
      },
    ],
    selectedItemId: null,
    selectedProjectFilter: 'all',
    selectedProjectId: 'proj-1',
    selectedProjectView: 'board',
  };
}

function createHandlerDependencies() {
  const runtimeController = createRuntimeControllerMock();
  const workflowStore = createMemoryStore({ snapshot: createWorkflowSnapshot() });
  const onWorkflowChanged = vi.fn();
  const handlerFactory = createToolHandler({
    getRuntimeController: () => runtimeController as never,
    onWorkflowChanged,
    workflowStore,
  });
  const handler = handlerFactory({
    agentId: 'agent-ctx',
    agentName: 'Worker',
    projectId: 'proj-1',
    ipcHostDir: '/tmp/dune-test-ipc',
    ipcContainerDir: '/workspace/extra/dune/ipc/',
  });
  const replyFn = vi.fn();

  return {
    handler,
    onWorkflowChanged,
    replyFn,
    runtimeController,
    workflowStore,
  };
}

describe('tools-handler', () => {
  it('lists the available workflow, agent, and runtime tools without direct agent messaging', async () => {
    const { handler, replyFn } = createHandlerDependencies();

    handler({ type: 'tools/list', payload: {} }, 'file-1', replyFn);
    await flushHandler();

    expect(replyFn).toHaveBeenCalledWith(expect.objectContaining({
      type: 'tools/list-result',
      payload: expect.objectContaining({
        tools: expect.arrayContaining([
          expect.objectContaining({ name: 'workflow.items.list' }),
          expect.objectContaining({
            inputSchema: expect.objectContaining({
              properties: expect.objectContaining({
                status: expect.objectContaining({
                  enum: ['inbox', 'ready', 'active', 'review', 'done'],
                }),
              }),
            }),
            name: 'workflow.items.move',
          }),
          expect.objectContaining({ name: 'workflow.tasks.update' }),
          expect.objectContaining({ name: 'workflow.work_products.add' }),
          expect.objectContaining({ name: 'workflow.assignments.set_primary_agent' }),
          expect.objectContaining({ name: 'agents.create' }),
          expect.objectContaining({ name: 'agents.list' }),
          expect.objectContaining({ name: 'runtime.get_snapshot' }),
        ]),
      }),
    }));

    const manifest = JSON.stringify(replyFn.mock.calls[0]?.[0]);
    expect(manifest).not.toContain('get-board');
    expect(manifest).not.toContain('agents.send_message');
  });

  it('lists work items for the current project by default', async () => {
    const { handler, replyFn } = createHandlerDependencies();

    handler(
      { type: 'tools/call', payload: { arguments: {}, name: 'workflow.items.list' } },
      'file-2',
      replyFn,
    );
    await flushHandler();

    expect(replyFn).toHaveBeenCalledWith(expect.objectContaining({
      type: 'tools/call-result',
      payload: {
        name: 'workflow.items.list',
        result: {
          items: expect.arrayContaining([expect.objectContaining({ id: 'item-1', title: 'Task A' })]),
        },
      },
    }));
  });

  it('creates a work item and persists it through the workflow store', async () => {
    const { handler, onWorkflowChanged, replyFn, workflowStore } = createHandlerDependencies();

    handler(
      {
        type: 'tools/call',
        payload: {
          arguments: { brief: 'Short brief', title: 'New item' },
          name: 'workflow.items.create',
        },
      },
      'file-3',
      replyFn,
    );
    await flushHandler();

    expect(replyFn).toHaveBeenCalledWith(expect.objectContaining({
      type: 'tools/call-result',
      payload: expect.objectContaining({
        name: 'workflow.items.create',
        result: expect.objectContaining({
          itemId: expect.stringContaining('item-'),
        }),
      }),
    }));
    expect(onWorkflowChanged).toHaveBeenCalledTimes(1);

    const snapshot = await workflowStore.get<{ items: Array<{ title: string }> }>('snapshot');
    expect(snapshot?.items.some((item) => item.title === 'New item')).toBe(true);
  });

  it('allows creating a work item in ready', async () => {
    const { handler, onWorkflowChanged, replyFn } = createHandlerDependencies();

    handler(
      {
        type: 'tools/call',
        payload: {
          arguments: { status: 'ready', title: 'New item' },
          name: 'workflow.items.create',
        },
      },
      'file-create-ready',
      replyFn,
    );
    await flushHandler();

    expect(replyFn).toHaveBeenCalledWith(expect.objectContaining({
      type: 'tools/call-result',
    }));
    expect(onWorkflowChanged).toHaveBeenCalled();
  });

  it('rejects editing a non-inbox work item', async () => {
    const { handler, replyFn } = createHandlerDependencies();

    handler(
      {
        type: 'tools/call',
        payload: {
          arguments: { itemId: 'item-ready', title: 'Retitled' },
          name: 'workflow.items.update',
        },
      },
      'file-update-ready',
      replyFn,
    );
    await flushHandler();

    expect(replyFn).toHaveBeenCalledWith({
      type: 'error',
      payload: {
        code: 'validation-error',
        message: 'Only inbox work items can be edited by agents.',
      },
    });
  });

  it('rejects moving a work item to an invalid status', async () => {
    const { handler, onWorkflowChanged, replyFn, workflowStore } = createHandlerDependencies();

    handler(
      {
        type: 'tools/call',
        payload: {
          arguments: { itemId: 'item-1', status: 'archived' },
          name: 'workflow.items.move',
        },
      },
      'file-move-invalid',
      replyFn,
    );
    await flushHandler();

    expect(replyFn).toHaveBeenCalledWith({
      type: 'error',
      payload: {
        code: 'validation-error',
        message: 'Work item status must be one of: inbox, ready, active, review, done.',
      },
    });
    expect(onWorkflowChanged).not.toHaveBeenCalled();

    const snapshot = await workflowStore.get<{
      items: Array<{ id: string; status: string }>;
    }>('snapshot');
    expect(snapshot?.items.find((item) => item.id === 'item-1')?.status).toBe('inbox');
  });

  it('allows agent moves from inbox to ready', async () => {
    const { handler, replyFn } = createHandlerDependencies();

    handler(
      {
        type: 'tools/call',
        payload: {
          arguments: { itemId: 'item-1', status: 'ready' },
          name: 'workflow.items.move',
        },
      },
      'file-move-ready',
      replyFn,
    );
    await flushHandler();

    expect(replyFn).toHaveBeenCalledWith(expect.objectContaining({
      type: 'tools/call-result',
    }));
  });

  it('allows the assigned worker to claim a ready item', async () => {
    const { handler, replyFn, workflowStore } = createHandlerDependencies();

    handler(
      {
        type: 'tools/call',
        payload: {
          arguments: { itemId: 'item-ready', status: 'active' },
          name: 'workflow.items.move',
        },
      },
      'file-move-active',
      replyFn,
    );
    await flushHandler();

    expect(replyFn).toHaveBeenCalledWith(expect.objectContaining({
      type: 'tools/call-result',
      payload: expect.objectContaining({
        name: 'workflow.items.move',
        result: expect.objectContaining({
          item: expect.objectContaining({ id: 'item-ready', status: 'active' }),
        }),
      }),
    }));

    const snapshot = await workflowStore.get<{
      items: Array<{ id: string; status: string }>;
    }>('snapshot');
    expect(snapshot?.items.find((item) => item.id === 'item-ready')?.status).toBe('active');
  });

  it('rejects claiming a ready item for a non-assigned worker', async () => {
    const runtimeController = createRuntimeControllerMock();
    const workflowStore = createMemoryStore({ snapshot: createWorkflowSnapshot() });
    const handlerFactory = createToolHandler({
      getRuntimeController: () => runtimeController as never,
      onWorkflowChanged: vi.fn(),
      workflowStore,
    });
    const handler = handlerFactory({
      agentId: 'agent-other',
      agentName: 'Other Worker',
      projectId: 'proj-1',
      ipcHostDir: '/tmp/dune-test-ipc-other',
      ipcContainerDir: '/workspace/extra/dune/ipc/',
    });
    const replyFn = vi.fn();

    handler(
      {
        type: 'tools/call',
        payload: {
          arguments: { itemId: 'item-ready', status: 'active' },
          name: 'workflow.items.move',
        },
      },
      'file-move-active-other',
      replyFn,
    );
    await flushHandler();

    expect(replyFn).toHaveBeenCalledWith({
      type: 'error',
      payload: {
        code: 'validation-error',
        message: 'Only the assigned worker can claim ready work items.',
      },
    });
  });

  it('allows the assigned worker to move an active item to review', async () => {
    const { handler, replyFn, workflowStore } = createHandlerDependencies();

    handler(
      {
        type: 'tools/call',
        payload: {
          arguments: { itemId: 'item-active', status: 'review' },
          name: 'workflow.items.move',
        },
      },
      'file-move-review',
      replyFn,
    );
    await flushHandler();

    const snapshot = await workflowStore.get<{
      items: Array<{ id: string; status: string }>;
    }>('snapshot');
    expect(snapshot?.items.find((item) => item.id === 'item-active')?.status).toBe('review');
  });

  it('rejects agent moves out of review', async () => {
    const { handler, replyFn } = createHandlerDependencies();

    handler(
      {
        type: 'tools/call',
        payload: {
          arguments: { itemId: 'item-review', status: 'done' },
          name: 'workflow.items.move',
        },
      },
      'file-review-done',
      replyFn,
    );
    await flushHandler();

    expect(replyFn).toHaveBeenCalledWith({
      type: 'error',
      payload: {
        code: 'validation-error',
        message: 'Only humans can move work items into done.',
      },
    });
  });

  it('rejects task changes while a work item is ready', async () => {
    const { handler, replyFn } = createHandlerDependencies();

    handler(
      {
        type: 'tools/call',
        payload: {
          arguments: { itemId: 'item-ready', title: 'New task' },
          name: 'workflow.tasks.add',
        },
      },
      'file-task-ready',
      replyFn,
    );
    await flushHandler();

    expect(replyFn).toHaveBeenCalledWith({
      type: 'error',
      payload: {
        code: 'validation-error',
        message: 'Agents can only change tasks while a work item is in inbox or active.',
      },
    });
  });

  it('allows the assigned worker to change active tasks and add work products', async () => {
    const workflowStore = createMemoryStore({
      snapshot: {
        ...createWorkflowSnapshot(),
        items: createWorkflowSnapshot().items.map((item) =>
          item.id === 'item-active'
            ? {
                ...item,
                tasks: [
                  {
                    createdAt: 0,
                    id: 'task-active-1',
                    notes: '',
                    status: 'todo',
                    title: 'Ship it',
                    updatedAt: 0,
                  },
                ],
              }
            : item
        ),
      },
    });
    const runtimeController = createRuntimeControllerMock();
    const handlerFactory = createToolHandler({
      getRuntimeController: () => runtimeController as never,
      onWorkflowChanged: vi.fn(),
      workflowStore,
    });
    const handler = handlerFactory({
      agentId: 'agent-ctx',
      agentName: 'Worker',
      projectId: 'proj-1',
      ipcHostDir: '/tmp/dune-test-ipc',
      ipcContainerDir: '/workspace/extra/dune/ipc/',
    });
    const replyFn = vi.fn();

    handler(
      {
        type: 'tools/call',
        payload: {
          arguments: { itemId: 'item-active', taskId: 'task-active-1', status: 'done' },
          name: 'workflow.tasks.update',
        },
      },
      'file-task-active',
      replyFn,
    );
    await flushHandler();

    handler(
      {
        type: 'tools/call',
        payload: {
          arguments: { body: 'Output body', itemId: 'item-active', title: 'Result' },
          name: 'workflow.work_products.add',
        },
      },
      'file-work-product-active',
      replyFn,
    );
    await flushHandler();

    const snapshot = await workflowStore.get<{
      items: Array<{
        id: string;
        tasks: Array<{ id: string; status: string }>;
        workProducts: Array<{ title: string }>;
      }>;
    }>('snapshot');
    const activeItem = snapshot?.items.find((item) => item.id === 'item-active');

    expect(activeItem?.tasks.find((task) => task.id === 'task-active-1')?.status).toBe('done');
    expect(activeItem?.workProducts[0]?.title).toBe('Result');
  });

  it('rejects work product changes on non-active work items', async () => {
    const { handler, replyFn } = createHandlerDependencies();

    handler(
      {
        type: 'tools/call',
        payload: {
          arguments: { body: 'Output body', itemId: 'item-review', title: 'Result' },
          name: 'workflow.work_products.add',
        },
      },
      'file-work-product-review',
      replyFn,
    );
    await flushHandler();

    expect(replyFn).toHaveBeenCalledWith({
      type: 'error',
      payload: {
        code: 'validation-error',
        message: 'Agents can only add work products while a work item is active.',
      },
    });
  });

  it('rejects assignment changes outside ready', async () => {
    const { handler, replyFn } = createHandlerDependencies();

    handler(
      {
        type: 'tools/call',
        payload: {
          arguments: { agentId: 'agent-1', itemId: 'item-active' },
          name: 'workflow.assignments.set_primary_agent',
        },
      },
      'file-assign-active',
      replyFn,
    );
    await flushHandler();

    expect(replyFn).toHaveBeenCalledWith({
      type: 'error',
      payload: {
        code: 'validation-error',
        message: 'Primary agent assignment can only change while a work item is in ready.',
      },
    });
  });

  it('rejects clearing an assignment outside ready', async () => {
    const { handler, replyFn } = createHandlerDependencies();

    handler(
      {
        type: 'tools/call',
        payload: {
          arguments: { itemId: 'item-active' },
          name: 'workflow.assignments.clear_primary_agent',
        },
      },
      'file-clear-active',
      replyFn,
    );
    await flushHandler();

    expect(replyFn).toHaveBeenCalledWith({
      type: 'error',
      payload: {
        code: 'validation-error',
        message: 'Primary agent assignment can only change while a work item is in ready.',
      },
    });
  });

  it('creates an item artifact folder when the project has a configured root path', async () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dune-tools-root-'));
    const snapshot = createWorkflowSnapshot();
    const workflowStore = createMemoryStore({
      snapshot: {
        ...snapshot,
        projects: snapshot.projects.map((project) =>
          project.id === 'proj-1'
            ? { ...project, rootPath: rootDir }
            : project,
        ),
      },
    });
    const runtimeController = createRuntimeControllerMock();
    const onWorkflowChanged = vi.fn();
    const handlerFactory = createToolHandler({
      getRuntimeController: () => runtimeController as never,
      onWorkflowChanged,
      workflowStore,
    });
    const handler = handlerFactory({
      agentId: 'agent-ctx',
      agentName: 'Worker',
      projectId: 'proj-1',
      ipcHostDir: '/tmp/dune-test-ipc',
      ipcContainerDir: '/workspace/extra/dune/ipc/',
    });
    const replyFn = vi.fn();

    try {
      handler(
        {
          type: 'tools/call',
          payload: {
            arguments: { brief: 'Short brief', title: 'New item' },
            name: 'workflow.items.create',
          },
        },
        'file-artifacts',
        replyFn,
      );
      await flushHandler();

      const persistedSnapshot = await workflowStore.get<{
        items: Array<{ artifactFolderName: string; title: string }>;
      }>('snapshot');
      const createdItem = persistedSnapshot?.items.find((item) => item.title === 'New item');
      const createResult = replyFn.mock.calls[0]?.[0]?.payload?.result as
        | { item?: { artifactPath?: string | null } }
        | undefined;

      expect(createdItem?.artifactFolderName).toMatch(/^new-item-/);
      expect(fs.existsSync(path.join(rootDir, createdItem?.artifactFolderName ?? 'missing'))).toBe(true);
      expect(createResult?.item?.artifactPath).toBe(
        `/workspace/extra/project/${createdItem?.artifactFolderName}`,
      );
    } finally {
      fs.rmSync(rootDir, { force: true, recursive: true });
    }
  });

  it('creates an agent in the current project by default', async () => {
    const { handler, replyFn, runtimeController } = createHandlerDependencies();

    handler(
      {
        type: 'tools/call',
        payload: {
          arguments: { name: 'New agent' },
          name: 'agents.create',
        },
      },
      'file-4',
      replyFn,
    );
    await flushHandler();

    expect(runtimeController.createAgent).toHaveBeenCalledWith({
      channelId: 'dune-chat',
      name: 'New agent',
      projectId: 'proj-1',
      projectName: 'Project One',
      projectRootPath: null,
    });
    expect(replyFn).toHaveBeenCalledWith(expect.objectContaining({
      type: 'tools/call-result',
      payload: {
        name: 'agents.create',
        result: { agentId: 'agent-created' },
      },
    }));
  });

  it('assigns a primary agent on a ready item without clearing other ready assignments', async () => {
    const { handler, replyFn, runtimeController, workflowStore } = createHandlerDependencies();

    handler(
      {
        type: 'tools/call',
        payload: {
          arguments: { agentId: 'agent-1', itemId: 'item-ready' },
          name: 'workflow.assignments.set_primary_agent',
        },
      },
      'file-assign-1',
      replyFn,
    );
    await flushHandler();

    expect(replyFn).toHaveBeenCalledWith(expect.objectContaining({
      type: 'tools/call-result',
      payload: expect.objectContaining({
        name: 'workflow.assignments.set_primary_agent',
        result: { success: true },
      }),
    }));
    expect(runtimeController.sendAgentMessage).not.toHaveBeenCalled();

    const snapshot = await workflowStore.get<{
      items: Array<{ id: string; primaryAgentId: string | null }>;
    }>('snapshot');
    expect(snapshot?.items.find((item) => item.id === 'item-ready')?.primaryAgentId).toBe('agent-1');
    expect(snapshot?.items.find((item) => item.id === 'item-ready-2')?.primaryAgentId).toBe('agent-1');
  });

  it('remains silent on assignment even when the project has a root path', async () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dune-tools-root-'));
    const snapshot = createWorkflowSnapshot();
    const workflowStore = createMemoryStore({
      snapshot: {
        ...snapshot,
        projects: snapshot.projects.map((project) =>
          project.id === 'proj-1'
            ? { ...project, rootPath: rootDir }
            : project,
        ),
      },
    });
    const runtimeController = createRuntimeControllerMock();
    const onWorkflowChanged = vi.fn();
    const handlerFactory = createToolHandler({
      getRuntimeController: () => runtimeController as never,
      onWorkflowChanged,
      workflowStore,
    });
    const handler = handlerFactory({
      agentId: 'agent-ctx',
      agentName: 'Worker',
      projectId: 'proj-1',
      ipcHostDir: '/tmp/dune-test-ipc',
      ipcContainerDir: '/workspace/extra/dune/ipc/',
    });
    const replyFn = vi.fn();

    try {
      handler(
        {
          type: 'tools/call',
          payload: {
            arguments: { agentId: 'agent-1', itemId: 'item-ready' },
            name: 'workflow.assignments.set_primary_agent',
          },
        },
        'file-assign-artifacts',
        replyFn,
      );
      await flushHandler();

      expect(runtimeController.sendAgentMessage).not.toHaveBeenCalled();
    } finally {
      fs.rmSync(rootDir, { force: true, recursive: true });
    }
  });

  it('returns sanitized agent summaries from agents.list', async () => {
    const { handler, replyFn } = createHandlerDependencies();

    handler(
      { type: 'tools/call', payload: { arguments: {}, name: 'agents.list' } },
      'file-5',
      replyFn,
    );
    await flushHandler();

    expect(replyFn).toHaveBeenCalledWith(expect.objectContaining({
      type: 'tools/call-result',
      payload: {
        name: 'agents.list',
        result: {
          agents: [
            {
              id: 'agent-1',
              name: 'Navigator',
              projectId: 'proj-1',
              role: 'custom',
              status: 'ready',
              updatedAt: 10,
            },
          ],
        },
      },
    }));

    const listedAgent = replyFn.mock.calls[0]?.[0]?.payload?.result?.agents?.[0] as Record<string, unknown>;
    expect(listedAgent).not.toHaveProperty('messages');
    expect(listedAgent).not.toHaveProperty('preview');
    expect(listedAgent).not.toHaveProperty('note');
    expect(listedAgent).not.toHaveProperty('workspace');
    expect(listedAgent).not.toHaveProperty('contextCards');
  });

  it('returns a sanitized agent from agents.get', async () => {
    const { handler, replyFn } = createHandlerDependencies();

    handler(
      { type: 'tools/call', payload: { arguments: { agentId: 'agent-1' }, name: 'agents.get' } },
      'file-6',
      replyFn,
    );
    await flushHandler();

    expect(replyFn).toHaveBeenCalledWith(expect.objectContaining({
      type: 'tools/call-result',
      payload: {
        name: 'agents.get',
        result: {
          agent: {
            id: 'agent-1',
            name: 'Navigator',
            projectId: 'proj-1',
            role: 'custom',
            status: 'ready',
            updatedAt: 10,
          },
        },
      },
    }));

    const agent = replyFn.mock.calls[0]?.[0]?.payload?.result?.agent as Record<string, unknown>;
    expect(agent).not.toHaveProperty('messages');
    expect(agent).not.toHaveProperty('preview');
    expect(agent).not.toHaveProperty('note');
    expect(agent).not.toHaveProperty('workspace');
    expect(agent).not.toHaveProperty('contextCards');
  });

  it('returns a sanitized runtime snapshot through runtime.get_snapshot', async () => {
    const { handler, replyFn } = createHandlerDependencies();

    handler(
      { type: 'tools/call', payload: { arguments: {}, name: 'runtime.get_snapshot' } },
      'file-7',
      replyFn,
    );
    await flushHandler();

    expect(replyFn).toHaveBeenCalledWith(expect.objectContaining({
      type: 'tools/call-result',
      payload: {
        name: 'runtime.get_snapshot',
        result: {
          snapshot: {
            agents: [
              {
                id: 'agent-1',
                name: 'Navigator',
                projectId: 'proj-1',
                role: 'custom',
                status: 'ready',
                updatedAt: 10,
              },
            ],
            isStreaming: true,
            runtimeInfo: expect.objectContaining({ status: 'ready' }),
          },
        },
      },
    }));

    const snapshot = replyFn.mock.calls[0]?.[0]?.payload?.result?.snapshot as Record<string, unknown>;
    expect(snapshot).not.toHaveProperty('selectedAgentId');
    expect(snapshot).not.toHaveProperty('telegramSetupSessions');
    expect(snapshot).not.toHaveProperty('externalChannels');

    const agent = (snapshot.agents as Array<Record<string, unknown>>)[0];
    expect(agent).not.toHaveProperty('messages');
    expect(agent).not.toHaveProperty('preview');
    expect(agent).not.toHaveProperty('note');
    expect(agent).not.toHaveProperty('workspace');
    expect(agent).not.toHaveProperty('contextCards');
  });

  it('rejects direct agent messaging through the tool surface', async () => {
    const { handler, replyFn, runtimeController } = createHandlerDependencies();

    handler(
      {
        type: 'tools/call',
        payload: {
          arguments: { agentId: 'agent-1', text: 'Hello' },
          name: 'agents.send_message',
        },
      },
      'file-8',
      replyFn,
    );
    await flushHandler();

    expect(runtimeController.sendAgentMessage).not.toHaveBeenCalled();
    expect(replyFn).toHaveBeenCalledWith({
      type: 'error',
      payload: {
        code: 'not-found',
        message: 'Unknown tool: agents.send_message',
      },
    });
  });
});
