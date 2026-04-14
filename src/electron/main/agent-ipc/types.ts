/** Base IPC message. Every file in the IPC directory is a JSON object with this shape. */
export interface IpcMessage<T extends string = string, P = Record<string, unknown>> {
  type: T;
  payload: P;
}

// ---------------------------------------------------------------------------
// Host → Agent  (written to host/)
// ---------------------------------------------------------------------------

/** User message payload shape. */
export interface UserMessagePayload {
  text: string;
}

/** User message shape. */
export type UserMessage = IpcMessage<'user-message', UserMessagePayload>;

// ---------------------------------------------------------------------------
// Agent → Host  (written to agent/)
// ---------------------------------------------------------------------------

/** Reply payload shape. */
export interface ReplyPayload {
  content: string;
  seq: number;
}

/** Reply message shape. */
export type ReplyMessage = IpcMessage<'reply', ReplyPayload>;

/** Reply done message shape. */
export type ReplyDoneMessage = IpcMessage<'reply-done', Record<string, never>>;

/** Agent message payload shape. */
export interface AgentMessagePayload {
  content: string;
}

/** IPC agent message shape. */
export type IpcAgentMessage = IpcMessage<'message', AgentMessagePayload>;

/** Error payload shape. */
export interface ErrorPayload {
  code: string;
  message: string;
}

/** Error message shape. */
export type ErrorMessage = IpcMessage<'error', ErrorPayload>;

// ---------------------------------------------------------------------------
// Tool discovery and invocation
// ---------------------------------------------------------------------------

/** Tool definition shape. */
export interface ToolDefinition {
  description: string;
  inputSchema: Record<string, unknown>;
  name: string;
}

/** Tools list message shape. */
export type ToolsListMessage = IpcMessage<'tools/list', Record<string, never>>;

/** Tool call payload shape. */
export interface ToolCallPayload {
  arguments?: Record<string, unknown>;
  name: string;
}

/** Tool call message shape. */
export type ToolCallMessage = IpcMessage<'tools/call', ToolCallPayload>;

/** Tools list result payload shape. */
export interface ToolsListResultPayload {
  tools: ToolDefinition[];
}

/** Tools list result message shape. */
export type ToolsListResultMessage = IpcMessage<'tools/list-result', ToolsListResultPayload>;

/** Tool call result payload shape. */
export interface ToolCallResultPayload {
  name: string;
  result: unknown;
}

/** Tool call result message shape. */
export type ToolCallResultMessage = IpcMessage<'tools/call-result', ToolCallResultPayload>;

// ---------------------------------------------------------------------------
// Union helpers
// ---------------------------------------------------------------------------

/** Host to agent message shape. */
export type HostToAgentMessage =
  | UserMessage
  | ErrorMessage
  | ToolsListResultMessage
  | ToolCallResultMessage;

/** Agent to host message shape. */
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
