/** Base IPC message. Every file in the IPC directory is a JSON object with this shape. */
export interface IpcMessage<T extends string = string, P = Record<string, unknown>> {
  type: T;
  payload: P;
}

// ---------------------------------------------------------------------------
// Host → Agent  (written to host/)
// ---------------------------------------------------------------------------

export interface UserMessagePayload {
  text: string;
}

export type UserMessage = IpcMessage<'user-message', UserMessagePayload>;

// ---------------------------------------------------------------------------
// Agent → Host  (written to agent/)
// ---------------------------------------------------------------------------

export interface ReplyPayload {
  content: string;
  seq: number;
}

export type ReplyMessage = IpcMessage<'reply', ReplyPayload>;

export type ReplyDoneMessage = IpcMessage<'reply-done', Record<string, never>>;

export interface AgentMessagePayload {
  content: string;
}

export type IpcAgentMessage = IpcMessage<'message', AgentMessagePayload>;

export interface ErrorPayload {
  code: string;
  message: string;
}

export type ErrorMessage = IpcMessage<'error', ErrorPayload>;

// ---------------------------------------------------------------------------
// Agent → Host: Board Management  (written to agent/)
// ---------------------------------------------------------------------------

export interface GetBoardPayload {
  projectId: string;
}

export type GetBoardMessage = IpcMessage<'get-board', GetBoardPayload>;

export interface CreateItemPayload {
  title: string;
  brief?: string;
  projectId: string;
  status?: 'inbox' | 'ready' | 'active' | 'review' | 'done';
}

export type CreateItemMessage = IpcMessage<'create-item', CreateItemPayload>;

export interface UpdateItemPayload {
  itemId: string;
  title?: string;
  brief?: string;
}

export type UpdateItemMessage = IpcMessage<'update-item', UpdateItemPayload>;

export interface MoveItemPayload {
  itemId: string;
  status: 'inbox' | 'ready' | 'active' | 'review' | 'done';
}

export type MoveItemMessage = IpcMessage<'move-item', MoveItemPayload>;

export interface AddTaskPayload {
  itemId: string;
  title: string;
}

export type AddTaskMessage = IpcMessage<'add-task', AddTaskPayload>;

export interface UpdateTaskPayload {
  itemId: string;
  taskId: string;
  title?: string;
  notes?: string;
  status?: 'todo' | 'doing' | 'blocked' | 'review' | 'done';
}

export type UpdateTaskMessage = IpcMessage<'update-task', UpdateTaskPayload>;

export interface AddWorkProductPayload {
  itemId: string;
  title: string;
  body: string;
}

export type AddWorkProductMessage = IpcMessage<'add-work-product', AddWorkProductPayload>;

// ---------------------------------------------------------------------------
// Host → Agent: Board Responses  (written to host/ as replies)
// ---------------------------------------------------------------------------

export interface BoardDataPayload {
  items: Array<{
    id: string;
    title: string;
    brief: string;
    status: string;
    primaryAgentId: string | null;
    tasks: Array<{ id: string; title: string; status: string; notes: string }>;
    workProducts: Array<{ id: string; title: string; body: string }>;
  }>;
}

export type BoardDataMessage = IpcMessage<'board-data', BoardDataPayload>;

export interface ItemCreatedPayload {
  itemId: string;
}

export type ItemCreatedMessage = IpcMessage<'item-created', ItemCreatedPayload>;

export interface TaskCreatedPayload {
  taskId: string;
}

export type TaskCreatedMessage = IpcMessage<'task-created', TaskCreatedPayload>;

export interface WorkProductCreatedPayload {
  workProductId: string;
}

export type WorkProductCreatedMessage = IpcMessage<'work-product-created', WorkProductCreatedPayload>;

export interface AckPayload {
  success: boolean;
}

export type AckMessage = IpcMessage<'ack', AckPayload>;

// ---------------------------------------------------------------------------
// Union helpers
// ---------------------------------------------------------------------------

export type HostToAgentMessage =
  | UserMessage
  | BoardDataMessage
  | ItemCreatedMessage
  | TaskCreatedMessage
  | WorkProductCreatedMessage
  | AckMessage;

export type AgentToHostMessage =
  | ReplyMessage
  | ReplyDoneMessage
  | IpcAgentMessage
  | ErrorMessage
  | GetBoardMessage
  | CreateItemMessage
  | UpdateItemMessage
  | MoveItemMessage
  | AddTaskMessage
  | UpdateTaskMessage
  | AddWorkProductMessage;

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

import { nanoid } from 'nanoid';

/** Generate a unique IPC filename stem: `{timestamp}-{rand}` */
export function createIpcFileId(): string {
  return `${Date.now()}-${nanoid(6)}`;
}

/** Parse an IPC JSON file. Returns null if the file is invalid. */
export function parseIpcMessage(raw: string): IpcMessage | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'type' in parsed &&
      'payload' in parsed &&
      typeof (parsed as IpcMessage).type === 'string'
    ) {
      return parsed as IpcMessage;
    }
    return null;
  } catch {
    return null;
  }
}
