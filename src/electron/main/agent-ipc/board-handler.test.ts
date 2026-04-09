import { describe, expect, it, vi } from 'vitest';

import type { AppStorage } from '@/electron/main/storage/app-storage';
import { createBoardHandler } from './board-handler';

function createMemoryStore(initialData: Record<string, unknown> = {}): AppStorage {
  const data = new Map<string, unknown>(Object.entries(initialData));
  return {
    get: async <T,>(key: string) => (data.get(key) as T) ?? null,
    set: async <T,>(key: string, value: T) => { data.set(key, value); },
    delete: async (key: string) => { data.delete(key); },
    keys: async () => [...data.keys()],
  };
}

function createProject(id: string, name: string = 'Test Project') {
  return { id, name, description: '', color: '#000', createdAt: Date.now(), updatedAt: Date.now() };
}

function createSnapshot(items: unknown[] = [], projects: unknown[] = []) {
  return {
    items,
    projects,
    selectedItemId: null,
    selectedProjectFilter: 'all',
    selectedProjectId: null,
    selectedProjectView: 'board',
  };
}

describe('board-handler', () => {
  it('handles get-board and returns filtered items', async () => {
    const store = createMemoryStore({
      snapshot: createSnapshot([
        { id: 'item-1', title: 'Task A', brief: '', status: 'active', projectId: 'proj-1', primaryAgentId: null, tasks: [], workProducts: [], workflowEvents: [] },
        { id: 'item-2', title: 'Task B', brief: '', status: 'done', projectId: 'proj-2', primaryAgentId: null, tasks: [], workProducts: [], workflowEvents: [] },
      ], [createProject('proj-1'), createProject('proj-2')]),
    });

    const handler = createBoardHandler(store, () => {});
    const replyFn = vi.fn();

    handler(
      { type: 'get-board', payload: { projectId: 'proj-1' } },
      'file-1',
      replyFn,
    );

    // handler is async internally — wait a tick
    await new Promise((r) => setTimeout(r, 10));

    expect(replyFn).toHaveBeenCalledWith(expect.objectContaining({
      type: 'board-data',
      payload: {
        items: [expect.objectContaining({ id: 'item-1', title: 'Task A' })],
      },
    }));
  });

  it('handles create-item and returns the new ID', async () => {
    const store = createMemoryStore({ snapshot: createSnapshot([], [createProject('proj-1')]) });
    const handler = createBoardHandler(store, () => {});
    const replyFn = vi.fn();

    handler(
      { type: 'create-item', payload: { title: 'New item', projectId: 'proj-1' } },
      'file-2',
      replyFn,
    );

    await new Promise((r) => setTimeout(r, 10));

    expect(replyFn).toHaveBeenCalledWith(expect.objectContaining({
      type: 'item-created',
      payload: expect.objectContaining({ itemId: expect.stringContaining('item-') }),
    }));

    const snapshot = await store.get<{ items: { title: string }[] }>('snapshot');
    expect(snapshot!.items).toHaveLength(1);
    expect(snapshot!.items[0]!.title).toBe('New item');
  });

  it('handles move-item and updates status', async () => {
    const store = createMemoryStore({
      snapshot: createSnapshot([
        { id: 'item-1', title: 'X', brief: '', status: 'inbox', projectId: 'p', primaryAgentId: null, sortOrder: 0, tasks: [], workProducts: [], workflowEvents: [], createdAt: 0, updatedAt: 0 },
      ]),
    });

    const handler = createBoardHandler(store, () => {});
    const replyFn = vi.fn();

    handler(
      { type: 'move-item', payload: { itemId: 'item-1', status: 'done' } },
      'file-3',
      replyFn,
    );

    await new Promise((r) => setTimeout(r, 10));

    expect(replyFn).toHaveBeenCalledWith({ type: 'ack', payload: { success: true } });

    const snapshot = await store.get<{ items: { status: string }[] }>('snapshot');
    expect(snapshot!.items[0]!.status).toBe('done');
  });

  it('handles add-task and returns task ID', async () => {
    const store = createMemoryStore({
      snapshot: createSnapshot([
        { id: 'item-1', title: 'X', brief: '', status: 'active', projectId: 'p', primaryAgentId: null, sortOrder: 0, tasks: [], workProducts: [], workflowEvents: [], createdAt: 0, updatedAt: 0 },
      ]),
    });

    const handler = createBoardHandler(store, () => {});
    const replyFn = vi.fn();

    handler(
      { type: 'add-task', payload: { itemId: 'item-1', title: 'Write tests' } },
      'file-4',
      replyFn,
    );

    await new Promise((r) => setTimeout(r, 10));

    expect(replyFn).toHaveBeenCalledWith(expect.objectContaining({
      type: 'task-created',
      payload: expect.objectContaining({ taskId: expect.stringContaining('task-') }),
    }));

    const snapshot = await store.get<{ items: { tasks: { title: string }[] }[] }>('snapshot');
    expect(snapshot!.items[0]!.tasks).toHaveLength(1);
    expect(snapshot!.items[0]!.tasks[0]!.title).toBe('Write tests');
  });

  it('returns error for non-existent item', async () => {
    const store = createMemoryStore({ snapshot: createSnapshot() });
    const handler = createBoardHandler(store, () => {});
    const replyFn = vi.fn();

    handler(
      { type: 'move-item', payload: { itemId: 'nope', status: 'done' } },
      'file-5',
      replyFn,
    );

    await new Promise((r) => setTimeout(r, 10));

    expect(replyFn).toHaveBeenCalledWith(expect.objectContaining({
      type: 'error',
      payload: expect.objectContaining({ code: 'not-found' }),
    }));
  });

  it('returns error when no snapshot exists', async () => {
    const store = createMemoryStore();
    const handler = createBoardHandler(store, () => {});
    const replyFn = vi.fn();

    handler(
      { type: 'get-board', payload: { projectId: 'p' } },
      'file-6',
      replyFn,
    );

    await new Promise((r) => setTimeout(r, 10));

    expect(replyFn).toHaveBeenCalledWith(expect.objectContaining({
      type: 'error',
      payload: expect.objectContaining({ code: 'no-snapshot' }),
    }));
  });
});
