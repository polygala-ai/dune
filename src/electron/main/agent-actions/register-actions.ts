// Register dune's host-side handlers as agentlite actions on a per-agent
// basis using agentlite's built-in HTTP `actions` transport.
//
// Each `agent.action(name, schema, handler)` call wires one host function
// into the agent's container. Inside the VM, the LLM discovers actions via
// `search_actions` and invokes them via `call_action` — the container shim
// turns those into authenticated HTTP POSTs to the host's actions server.
//
// Schemas are written as Zod literals here. Handlers share a compact
// per-agent context shape that captures the owning agent identity plus the
// mounted Dune paths that action handlers need.

import { z } from 'zod';

import type { Agent as AgentLiteAgent } from '@boxlite-ai/agentlite';

import type { DesktopRuntimeController } from '@/electron/main/runtime/desktop-runtime-controller';
import type { AppStorage } from '@/electron/main/storage/app-storage';
import type { AuditDatabase } from '@/electron/main/audit/audit-db';

import { agentTools } from '@/electron/main/agent-actions/handlers/agents';
import { itemTools } from '@/electron/main/agent-actions/handlers/items';
import { projectTools } from '@/electron/main/agent-actions/handlers/projects';
import { runtimeTools } from '@/electron/main/agent-actions/handlers/runtime';
import { taskTools } from '@/electron/main/agent-actions/handlers/tasks';
import { workProductTools } from '@/electron/main/agent-actions/handlers/work-products';
import type {
  RegisteredTool,
  ToolHandlerContext,
  ToolServices,
} from '@/electron/main/agent-actions/handlers/types';

/** Services captured by every action handler closure. */
export interface ActionHostServices {
  auditLog?: AuditDatabase;
  getRuntimeController: () => DesktopRuntimeController;
  onWorkflowChanged: () => void;
  workflowStore: AppStorage;
}

/**
 * Identity + paths of the dune agent being registered. Captured at action
 * registration time and baked into every handler closure.
 */
export interface ActionOwner {
  agentId: string;
  agentName: string;
  projectId: string;
  /** Host absolute path of the `dune` mount (was the IPC dir parent). */
  duneMountHostDir: string;
  /** Container path of the `dune` mount, e.g. `/workspace/extra/dune/`. */
  duneMountContainerDir: string;
}

/** Registry of all available tool handlers keyed by their dotted name. */
const TOOLS_BY_NAME = new Map<string, RegisteredTool>(
  [
    ...projectTools,
    ...itemTools,
    ...taskTools,
    ...workProductTools,
    ...agentTools,
    ...runtimeTools,
  ].map((tool) => [tool.definition.name, tool] as const),
);

/** Convert a dotted tool name to the snake-case action name shown to the LLM. */
function toActionName(toolName: string): string {
  return toolName.replace(/\./g, '_');
}

/** Build the per-agent tool context from the action owner. */
function makeAgentContext(owner: ActionOwner): ToolHandlerContext {
  return {
    agentId: owner.agentId,
    agentName: owner.agentName,
    projectId: owner.projectId,
    ipcHostDir: owner.duneMountHostDir,
    ipcContainerDir: owner.duneMountContainerDir,
  };
}

/**
 * Register dune's full action surface on one agentlite agent. Call this
 * after `agentLite.getOrCreateAgent(...)` returns, before or after `start()`.
 */
export function registerDuneActions(
  agent: AgentLiteAgent,
  services: ActionHostServices,
  owner: ActionOwner,
): void {
  const agentContext = makeAgentContext(owner);
  const toolServices: ToolServices = { ...services, agentContext };

  /** Register one tool by its dotted name with a Zod input schema. */
  function reg(
    toolName: string,
    schema: z.ZodRawShape,
  ): void {
    const tool = TOOLS_BY_NAME.get(toolName);
    if (!tool) {
      throw new Error(`registerDuneActions: unknown tool "${toolName}"`);
    }
    agent.action(
      toActionName(toolName),
      tool.definition.description,
      schema,
      async (args) => tool.handler(toolServices, args as Record<string, unknown>),
    );
  }

  // ---- Projects -----------------------------------------------------------
  reg('workflow.projects.list', {});
  reg('workflow.projects.get', {
    projectId: z.string().optional().describe('Project ID. Omit for current project.'),
  });
  reg('workflow.projects.create', {
    name: z.string().describe('Project name'),
    description: z.string().optional().describe('Project description'),
    rootPath: z.string().optional().describe('Absolute path to the project folder on disk'),
  });
  reg('workflow.projects.update', {
    projectId: z.string().optional().describe('Project ID. Omit for current project.'),
    name: z.string().optional().describe('New name'),
    description: z.string().optional().describe('New description'),
    rootPath: z.string().optional().describe('Project folder path (can only be set once)'),
  });
  reg('workflow.projects.delete', {
    projectId: z.string().optional().describe('Project ID. Omit for current project.'),
  });

  // ---- Items --------------------------------------------------------------
  reg('workflow.items.list', {
    projectId: z.string().optional().describe('Project ID. Omit for current project.'),
  });
  reg('workflow.items.create', {
    title: z.string().describe('Work item title'),
    brief: z.string().optional().describe('Work item brief/description'),
    note: z.string().optional().describe('Optional note to add to workflow history with this creation.'),
    projectId: z.string().optional().describe('Project ID. Omit for current project.'),
    status: z.enum(['inbox', 'ready']).optional().describe('Initial status (default: inbox)'),
  });
  reg('workflow.items.update', {
    itemId: z.string().describe('Work item ID'),
    title: z.string().optional().describe('New title'),
    brief: z.string().optional().describe('New brief'),
    note: z.string().optional().describe('Optional note to add to workflow history with this update.'),
    primaryAgentId: z.string().nullable().optional()
      .describe('Agent ID to assign, or null to unassign. Cannot change while item is done.'),
  });
  reg('workflow.items.move', {
    itemId: z.string().describe('Work item ID'),
    note: z.string().optional().describe('Optional note to add to workflow history with this move.'),
    status: z.enum(['inbox', 'ready', 'active', 'review', 'acceptance', 'done'])
      .describe('Destination lane. Agents may move reviewed items into acceptance and can move items out of acceptance, but only humans may move items into done.'),
    index: z.number().optional().describe('Position within the lane (default: end)'),
  });
  reg('workflow.items.add_feedback', {
    itemId: z.string().describe('Work item ID'),
    feedback: z.string().describe('Feedback text (e.g. "Agent review: approved")'),
  });

  // ---- Tasks --------------------------------------------------------------
  reg('workflow.tasks.add', {
    itemId: z.string().describe('Work item ID'),
    note: z.string().optional().describe('Optional note to add to workflow history with this task addition.'),
    title: z.string().describe('Task title'),
  });
  reg('workflow.tasks.update', {
    itemId: z.string().describe('Work item ID'),
    note: z.string().optional().describe('Optional note to add to workflow history with this task update.'),
    taskId: z.string().describe('Task ID'),
    title: z.string().optional().describe('New title'),
    notes: z.string().optional().describe('Task notes'),
    status: z.enum(['todo', 'doing', 'blocked', 'review', 'done']).optional().describe('Task status'),
  });
  reg('workflow.tasks.delete', {
    itemId: z.string().describe('Work item ID'),
    note: z.string().optional().describe('Optional note to add to workflow history with this task deletion.'),
    taskId: z.string().describe('Task ID'),
  });

  // ---- Work products ------------------------------------------------------
  reg('workflow.work_products.add', {
    itemId: z.string().describe('Work item ID'),
    note: z.string().optional().describe('Optional note to add to workflow history with this output.'),
    title: z.string().describe('Work product title'),
    body: z.string().describe('Work product content'),
  });
  reg('workflow.work_products.delete', {
    itemId: z.string().describe('Work item ID'),
    note: z.string().optional().describe('Optional note to add to workflow history with this deletion.'),
    workProductId: z.string().describe('Work product ID'),
  });

  // ---- Agents -------------------------------------------------------------
  reg('agents.list', {
    projectId: z.string().optional().describe('Project ID. Omit for current project.'),
  });
  reg('agents.get', {
    agentId: z.string().describe('Agent ID'),
  });
  reg('agents.create', {
    name: z.string().describe('Agent name'),
    projectId: z.string().optional().describe('Project ID. Omit for current project.'),
    channelId: z.string().optional().describe('Channel type (default: dune-chat)'),
  });
  reg('agents.delete', {
    agentId: z.string().describe('Agent ID'),
  });
  reg('agents.update', {
    agentId: z.string().describe('Target agent ID (selector only; not mutated).'),
    responsibilities: z.array(z.string())
      .describe('New list of owned domains. Replaces the existing list entirely.'),
    notice: z.string().optional()
      .describe('Optional system-role message to send to the modified agent. If omitted, a default notice listing the new responsibilities is generated.'),
  });
  // ---- Runtime ------------------------------------------------------------
  reg('runtime.get_snapshot', {});
  reg('runtime.run_isolated_research', {
    maxConcurrency: z.number().optional().describe('Maximum number of isolated target runs to execute in parallel.'),
    reducerPrompt: z.string().describe('Instructions for the final reducer that merges per-target outputs.'),
    sharedPrompt: z.string().describe('Shared instructions applied to every isolated target run.'),
    targets: z.array(
      z.object({
        brief: z.string().describe('Self-contained brief for this single research target.'),
        id: z.string().optional().describe('Optional stable target identifier returned in the results.'),
        title: z.string().describe('Human-readable target title.'),
      }),
    ).describe('Independent research targets. Each target runs in isolated context.'),
  });

  // Coding engines now flow through AgentLite ACP peers (`acp_*` actions),
  // not Dune-owned `coding_engine_*` actions.
}
