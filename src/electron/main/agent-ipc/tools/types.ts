// Agent IPC tool types.

import type { AppStorage } from '@/electron/main/storage/app-storage';
import type { DesktopRuntimeController } from '@/electron/main/runtime/desktop-runtime-controller';
import type { CodingEngineEvent } from '@/renderer/features/agents/types';
import type { ToolDefinition } from '../types';

import type { ToolHandlerContext } from '../agent-ipc-connection';

/** Tool handler options. */
export interface ToolHandlerOptions {
  getRuntimeController: () => DesktopRuntimeController;
  onCodingEngineEvent?: (agentId: string, event: CodingEngineEvent) => void;
  onWorkflowChanged: () => void;
  workflowStore: AppStorage;
}

/** Tool services shape. */
export interface ToolServices extends ToolHandlerOptions {
  agentContext: ToolHandlerContext;
}

/** Runtime snapshot. */
export type RuntimeSnapshot = ReturnType<DesktopRuntimeController['getSnapshot']>;
/** Runtime agent shape. */
export type RuntimeAgent = RuntimeSnapshot['agents'][number];

/** Registered tool shape. */
export interface RegisteredTool {
  definition: ToolDefinition;
  handler: (services: ToolServices, args: Record<string, unknown>) => Promise<unknown>;
}

/** Tool handler error. */
export class ToolHandlerError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}
