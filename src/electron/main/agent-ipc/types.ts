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
// Tool discovery and invocation
// ---------------------------------------------------------------------------

export interface ToolDefinition {
  description: string;
  inputSchema: Record<string, unknown>;
  name: string;
}

export type ToolsListMessage = IpcMessage<'tools/list', Record<string, never>>;

export interface ToolCallPayload {
  arguments?: Record<string, unknown>;
  name: string;
}

export type ToolCallMessage = IpcMessage<'tools/call', ToolCallPayload>;

export interface ToolsListResultPayload {
  tools: ToolDefinition[];
}

export type ToolsListResultMessage = IpcMessage<'tools/list-result', ToolsListResultPayload>;

export interface ToolCallResultPayload {
  name: string;
  result: unknown;
}

export type ToolCallResultMessage = IpcMessage<'tools/call-result', ToolCallResultPayload>;

// ---------------------------------------------------------------------------
// Union helpers
// ---------------------------------------------------------------------------

export type HostToAgentMessage =
  | UserMessage
  | ErrorMessage
  | ToolsListResultMessage
  | ToolCallResultMessage;

export type AgentToHostMessage =
  | ReplyMessage
  | ReplyDoneMessage
  | IpcAgentMessage
  | ErrorMessage
  | ToolsListMessage
  | ToolCallMessage;

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
