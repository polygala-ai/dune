// Dune action handler types shared by the action-registration layer.

import type { AppStorage } from '@/electron/main/storage/app-storage';
import type { DesktopRuntimeController } from '@/electron/main/runtime/desktop-runtime-controller';
import type { AuditDatabase } from '@/electron/main/audit/audit-db';

/** MCP-style tool definition. Used internally by RegisteredTool. */
export interface ToolDefinition {
  description: string;
  inputSchema: Record<string, unknown>;
  name: string;
}

/** Per-agent identity and IPC paths passed into every tool call. */
export interface ToolHandlerContext {
  agentId: string;
  agentName: string;
  projectId: string;
  ipcHostDir: string;
  ipcContainerDir: string;
}

/** Tool handler options. */
export interface ToolHandlerOptions {
  auditLog?: AuditDatabase;
  getRuntimeController: () => DesktopRuntimeController;
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
