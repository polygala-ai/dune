// Agent IPC tool registry.

import type { IpcMessage } from '../types';

import type { ToolHandlerContext, ToolMessageHandler } from '../agent-ipc-connection';

import { agentTools } from './agents';
import { assignmentTools } from './assignments';
import { codingEngineTools } from './coding-engine';
import { readRecord, requireString } from './helpers';
import { itemTools } from './items';
import { projectTools } from './projects';
import { runtimeTools } from './runtime';
import { taskTools } from './tasks';
import {
  ToolHandlerError,
  type RegisteredTool,
  type ToolHandlerOptions,
} from './types';
import { workProductTools } from './work-products';

const registeredTools: RegisteredTool[] = [
  ...projectTools,
  ...itemTools,
  ...taskTools,
  ...workProductTools,
  ...assignmentTools,
  ...agentTools,
  ...runtimeTools,
  ...codingEngineTools,
];

const toolsByName = new Map(
  registeredTools.map((tool) => [tool.definition.name, tool] as const),
);

/** Creates tool handler. */
export function createToolHandler(
  options: ToolHandlerOptions,
): (agentContext: ToolHandlerContext) => ToolMessageHandler {
  return (agentContext: ToolHandlerContext) => (
    msg: IpcMessage,
    fileId: string,
    replyFn: (reply: IpcMessage) => void,
  ) => {
    void handleToolMessage(options, agentContext, msg, fileId, replyFn);
  };
}

/** Handles message tool. */
async function handleToolMessage(
  options: ToolHandlerOptions,
  agentContext: ToolHandlerContext,
  msg: IpcMessage,
  _fileId: string,
  replyFn: (reply: IpcMessage) => void,
): Promise<void> {
  try {
    if (msg.type === 'tools/list') {
      replyFn({
        type: 'tools/list-result',
        payload: {
          tools: registeredTools.map((tool) => tool.definition),
        },
      });
      return;
    }

    if (msg.type !== 'tools/call') {
      throw new ToolHandlerError('unknown-type', `Unknown message type: ${msg.type}`);
    }

    const payload = readRecord(msg.payload, 'payload');
    const name = requireString(payload.name, 'name');
    const argumentsPayload = payload.arguments === undefined
      ? {}
      : readRecord(payload.arguments, 'arguments');
    const tool = toolsByName.get(name);

    if (!tool) {
      throw new ToolHandlerError('not-found', `Unknown tool: ${name}`);
    }

    const result = await tool.handler({
      ...options,
      agentContext,
    }, argumentsPayload);

    replyFn({
      type: 'tools/call-result',
      payload: {
        name,
        result,
      },
    });
  } catch (error) {
    replyFn(toErrorMessage(error));
  }
}

/** Converts to error message. */
function toErrorMessage(error: unknown): IpcMessage<'error'> {
  if (error instanceof ToolHandlerError) {
    return {
      type: 'error',
      payload: {
        code: error.code,
        message: error.message,
      },
    };
  }

  return {
    type: 'error',
    payload: {
      code: 'internal-error',
      message: error instanceof Error ? error.message : String(error),
    },
  };
}

export type { ToolHandlerOptions };
