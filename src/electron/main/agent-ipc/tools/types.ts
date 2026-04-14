import type { AppStorage } from '@/electron/main/storage/app-storage';
import type { DesktopRuntimeController } from '@/electron/main/runtime/desktop-runtime-controller';
import type { CodingEngineEvent } from '@/renderer/features/agents/types';
import type { ToolDefinition } from '@/shared/agent-ipc/types';

import type { ToolHandlerContext } from '../agent-ipc-connection';

export interface ToolHandlerOptions {
  getRuntimeController: () => DesktopRuntimeController;
  onCodingEngineEvent?: (agentId: string, event: CodingEngineEvent) => void;
  onWorkflowChanged: () => void;
  workflowStore: AppStorage;
}

export interface ToolServices extends ToolHandlerOptions {
  agentContext: ToolHandlerContext;
}

export type RuntimeSnapshot = ReturnType<DesktopRuntimeController['getSnapshot']>;
export type RuntimeAgent = RuntimeSnapshot['agents'][number];

export interface RegisteredTool {
  definition: ToolDefinition;
  handler: (services: ToolServices, args: Record<string, unknown>) => Promise<unknown>;
}

export class ToolHandlerError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}
