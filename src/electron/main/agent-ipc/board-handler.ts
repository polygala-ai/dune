import type { AppStorage } from '@/electron/main/storage/app-storage';
import { createId } from '@/shared/id';
import type { IpcMessage } from '@/shared/agent-ipc/types';
import type { BoardMessageHandler } from './agent-ipc-connection';

interface WorkflowSnapshot {
  items: WorkflowItem[];
  projects: WorkflowProject[];
  selectedItemId: string | null;
  selectedProjectFilter: string;
  selectedProjectId: string | null;
  selectedProjectView: string;
}

interface WorkflowItem {
  brief: string;
  createdAt: number;
  id: string;
  primaryAgentId: string | null;
  projectId: string;
  sortOrder: number;
  status: string;
  tasks: WorkflowTask[];
  title: string;
  updatedAt: number;
  workProducts: WorkflowWorkProduct[];
  workflowEvents: WorkflowEvent[];
}

interface WorkflowTask {
  createdAt: number;
  id: string;
  notes: string;
  status: string;
  title: string;
  updatedAt: number;
}

interface WorkflowWorkProduct {
  body: string;
  createdAt: number;
  id: string;
  title: string;
}

interface WorkflowEvent {
  createdAt: number;
  description: string;
  id: string;
  kind: string;
}

interface WorkflowProject {
  color: string;
  createdAt: number;
  description: string;
  id: string;
  name: string;
  updatedAt: number;
}

export function createBoardHandler(
  workflowStore: AppStorage,
  onWorkflowChanged: () => void,
): BoardMessageHandler {
  return (msg, fileId, replyFn) => {
    void handleBoardMessage(workflowStore, onWorkflowChanged, msg, fileId, replyFn);
  };
}

async function handleBoardMessage(
  store: AppStorage,
  onWorkflowChanged: () => void,
  msg: IpcMessage,
  _fileId: string,
  replyFn: (reply: IpcMessage) => void,
): Promise<void> {
  const snapshot = await store.get<WorkflowSnapshot>('snapshot');
  if (!snapshot) {
    replyFn({ type: 'error', payload: { code: 'no-snapshot', message: 'No workflow data found' } });
    return;
  }

  let mutated = false;

  switch (msg.type) {
    case 'get-board':
      handleGetBoard(snapshot, msg.payload as { projectId: string }, replyFn);
      break;

    case 'create-item':
      await handleCreateItem(store, snapshot, msg.payload as {
        title: string; brief?: string; projectId: string; status?: string;
      }, replyFn);
      mutated = true;
      break;

    case 'update-item':
      await handleUpdateItem(store, snapshot, msg.payload as {
        itemId: string; title?: string; brief?: string;
      }, replyFn);
      mutated = true;
      break;

    case 'move-item':
      await handleMoveItem(store, snapshot, msg.payload as {
        itemId: string; status: string;
      }, replyFn);
      mutated = true;
      break;

    case 'add-task':
      await handleAddTask(store, snapshot, msg.payload as {
        itemId: string; title: string;
      }, replyFn);
      mutated = true;
      break;

    case 'update-task':
      await handleUpdateTask(store, snapshot, msg.payload as {
        itemId: string; taskId: string; title?: string; notes?: string; status?: string;
      }, replyFn);
      mutated = true;
      break;

    case 'add-work-product':
      await handleAddWorkProduct(store, snapshot, msg.payload as {
        itemId: string; title: string; body: string;
      }, replyFn);
      mutated = true;
      break;

    default:
      replyFn({ type: 'error', payload: { code: 'unknown-type', message: `Unknown message type: ${msg.type}` } });
  }

  if (mutated) {
    onWorkflowChanged();
  }
}

function handleGetBoard(
  snapshot: WorkflowSnapshot,
  payload: { projectId: string },
  replyFn: (reply: IpcMessage) => void,
): void {
  const project = snapshot.projects.find((p) => p.id === payload.projectId);
  if (!project) {
    replyFn({ type: 'error', payload: { code: 'not-found', message: `Project ${payload.projectId} not found. Available: ${snapshot.projects.map((p) => p.id).join(', ')}` } });
    return;
  }

  const items = snapshot.items
    .filter((item) => item.projectId === payload.projectId)
    .map((item) => ({
      id: item.id,
      title: item.title,
      brief: item.brief,
      status: item.status,
      primaryAgentId: item.primaryAgentId,
      tasks: item.tasks.map((t) => ({
        id: t.id,
        title: t.title,
        status: t.status,
        notes: t.notes,
      })),
      workProducts: item.workProducts.map((wp) => ({
        id: wp.id,
        title: wp.title,
        body: wp.body,
      })),
    }));

  replyFn({ type: 'board-data', payload: { items } });
}

async function handleCreateItem(
  store: AppStorage,
  snapshot: WorkflowSnapshot,
  payload: { title: string; brief?: string; projectId: string; status?: string },
  replyFn: (reply: IpcMessage) => void,
): Promise<void> {
  const project = snapshot.projects.find((p) => p.id === payload.projectId);
  if (!project) {
    replyFn({ type: 'error', payload: { code: 'not-found', message: `Project ${payload.projectId} not found. Available: ${snapshot.projects.map((p) => p.id).join(', ')}` } });
    return;
  }

  const now = Date.now();
  const itemId = createId('item');
  const status = payload.status ?? 'inbox';

  const sameStatusItems = snapshot.items.filter(
    (i) => i.projectId === payload.projectId && i.status === status,
  );

  const newItem: WorkflowItem = {
    brief: payload.brief ?? '',
    createdAt: now,
    id: itemId,
    primaryAgentId: null,
    projectId: payload.projectId,
    sortOrder: sameStatusItems.length,
    status,
    tasks: [],
    title: payload.title,
    updatedAt: now,
    workProducts: [],
    workflowEvents: [{
      createdAt: now,
      description: `Work item "${payload.title}" was created.`,
      id: createId('event'),
      kind: 'item',
    }],
  };

  snapshot.items.push(newItem);
  await store.set('snapshot', snapshot);
  replyFn({ type: 'item-created', payload: { itemId } });
}

async function handleUpdateItem(
  store: AppStorage,
  snapshot: WorkflowSnapshot,
  payload: { itemId: string; title?: string; brief?: string },
  replyFn: (reply: IpcMessage) => void,
): Promise<void> {
  const item = snapshot.items.find((i) => i.id === payload.itemId);
  if (!item) {
    replyFn({ type: 'error', payload: { code: 'not-found', message: `Item ${payload.itemId} not found` } });
    return;
  }

  const now = Date.now();
  if (payload.title !== undefined) item.title = payload.title;
  if (payload.brief !== undefined) item.brief = payload.brief;
  item.updatedAt = now;

  await store.set('snapshot', snapshot);
  replyFn({ type: 'ack', payload: { success: true } });
}

async function handleMoveItem(
  store: AppStorage,
  snapshot: WorkflowSnapshot,
  payload: { itemId: string; status: string },
  replyFn: (reply: IpcMessage) => void,
): Promise<void> {
  const item = snapshot.items.find((i) => i.id === payload.itemId);
  if (!item) {
    replyFn({ type: 'error', payload: { code: 'not-found', message: `Item ${payload.itemId} not found` } });
    return;
  }

  const now = Date.now();
  const oldStatus = item.status;
  item.status = payload.status;
  item.updatedAt = now;
  item.workflowEvents.unshift({
    createdAt: now,
    description: `Moved from "${oldStatus}" to "${payload.status}".`,
    id: createId('event'),
    kind: 'item',
  });

  await store.set('snapshot', snapshot);
  replyFn({ type: 'ack', payload: { success: true } });
}

async function handleAddTask(
  store: AppStorage,
  snapshot: WorkflowSnapshot,
  payload: { itemId: string; title: string },
  replyFn: (reply: IpcMessage) => void,
): Promise<void> {
  const item = snapshot.items.find((i) => i.id === payload.itemId);
  if (!item) {
    replyFn({ type: 'error', payload: { code: 'not-found', message: `Item ${payload.itemId} not found` } });
    return;
  }

  const now = Date.now();
  const taskId = createId('task');

  item.tasks.push({
    createdAt: now,
    id: taskId,
    notes: '',
    status: 'todo',
    title: payload.title,
    updatedAt: now,
  });
  item.updatedAt = now;
  item.workflowEvents.unshift({
    createdAt: now,
    description: `Task "${payload.title}" was added.`,
    id: createId('event'),
    kind: 'task',
  });

  await store.set('snapshot', snapshot);
  replyFn({ type: 'task-created', payload: { taskId } });
}

async function handleUpdateTask(
  store: AppStorage,
  snapshot: WorkflowSnapshot,
  payload: { itemId: string; taskId: string; title?: string; notes?: string; status?: string },
  replyFn: (reply: IpcMessage) => void,
): Promise<void> {
  const item = snapshot.items.find((i) => i.id === payload.itemId);
  if (!item) {
    replyFn({ type: 'error', payload: { code: 'not-found', message: `Item ${payload.itemId} not found` } });
    return;
  }

  const task = item.tasks.find((t) => t.id === payload.taskId);
  if (!task) {
    replyFn({ type: 'error', payload: { code: 'not-found', message: `Task ${payload.taskId} not found` } });
    return;
  }

  const now = Date.now();
  if (payload.title !== undefined) task.title = payload.title;
  if (payload.notes !== undefined) task.notes = payload.notes;
  if (payload.status !== undefined) task.status = payload.status;
  task.updatedAt = now;
  item.updatedAt = now;

  await store.set('snapshot', snapshot);
  replyFn({ type: 'ack', payload: { success: true } });
}

async function handleAddWorkProduct(
  store: AppStorage,
  snapshot: WorkflowSnapshot,
  payload: { itemId: string; title: string; body: string },
  replyFn: (reply: IpcMessage) => void,
): Promise<void> {
  const item = snapshot.items.find((i) => i.id === payload.itemId);
  if (!item) {
    replyFn({ type: 'error', payload: { code: 'not-found', message: `Item ${payload.itemId} not found` } });
    return;
  }

  const now = Date.now();
  const wpId = createId('work-product');

  item.workProducts.push({
    body: payload.body,
    createdAt: now,
    id: wpId,
    title: payload.title,
  });
  item.updatedAt = now;

  await store.set('snapshot', snapshot);
  replyFn({ type: 'work-product-created', payload: { workProductId: wpId } });
}
