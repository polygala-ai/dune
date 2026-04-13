/**
 * Dune MCP Server (stdio transport)
 *
 * Runs inside agent containers. Exposes Dune workflow, agent, and runtime
 * tools as native MCP tools. Communicates with the Dune host via file-based
 * IPC: writes request files, polls for response files.
 *
 * Environment variables (set by the agent runner):
 *   DUNE_IPC_PATH — path to the IPC directory (agent/ and host/ subdirs)
 *   DUNE_PROJECT_ID — current project ID
 *   DUNE_AGENT_ID — current agent ID
 *   DUNE_AGENT_NAME — current agent name
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import fs from 'fs';
import path from 'path';

// ---------------------------------------------------------------------------
// IPC plumbing
// ---------------------------------------------------------------------------

const IPC_PATH = process.env.DUNE_IPC_PATH ?? '/workspace/extra/dune/ipc';
const AGENT_DIR = path.join(IPC_PATH, 'agent');
const HOST_DIR = path.join(IPC_PATH, 'host');

const POLL_INTERVAL_MS = 100;
const POLL_TIMEOUT_MS = 30_000;

function createFileId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function writeRequest(fileId: string, type: string, payload: unknown): void {
  fs.mkdirSync(AGENT_DIR, { recursive: true });
  const data = JSON.stringify({ type, payload });
  const tmpPath = path.join(AGENT_DIR, `${fileId}.json.tmp`);
  const finalPath = path.join(AGENT_DIR, `${fileId}.json`);
  fs.writeFileSync(tmpPath, data);
  fs.renameSync(tmpPath, finalPath);
}

function pollResponse(fileId: string): Promise<unknown> {
  const responsePath = path.join(HOST_DIR, `${fileId}-reply.json`);

  return new Promise((resolve, reject) => {
    const deadline = Date.now() + POLL_TIMEOUT_MS;

    const check = () => {
      try {
        if (fs.existsSync(responsePath)) {
          const raw = fs.readFileSync(responsePath, 'utf-8');
          // Clean up the response file.
          try { fs.unlinkSync(responsePath); } catch { /* ok */ }

          const parsed = JSON.parse(raw) as { type: string; payload: unknown };

          if (parsed.type === 'error') {
            const err = parsed.payload as { code?: string; message?: string };
            reject(new Error(err.message ?? 'Tool call failed.'));
            return;
          }

          if (parsed.type === 'tools/call-result') {
            resolve((parsed.payload as { result: unknown }).result);
            return;
          }

          if (parsed.type === 'tools/list-result') {
            resolve(parsed.payload);
            return;
          }

          resolve(parsed.payload);
          return;
        }
      } catch {
        // File not ready yet — retry.
      }

      if (Date.now() > deadline) {
        reject(new Error('Dune host did not respond within 30 seconds.'));
        return;
      }

      setTimeout(check, POLL_INTERVAL_MS);
    };

    check();
  });
}

async function callTool(name: string, args: Record<string, unknown> = {}): Promise<unknown> {
  const fileId = createFileId();
  writeRequest(fileId, 'tools/call', { name, arguments: args });
  return pollResponse(fileId);
}

function mcpResult(data: unknown): { content: Array<{ type: 'text'; text: string }> } {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
  };
}

function mcpError(message: string): { content: Array<{ type: 'text'; text: string }>; isError: true } {
  return {
    content: [{ type: 'text' as const, text: message }],
    isError: true,
  };
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: 'dune',
  version: '1.0.0',
});

// ---------------------------------------------------------------------------
// Workflow — Projects
// ---------------------------------------------------------------------------

server.tool(
  'workflow_projects_list',
  'List all Dune projects.',
  {},
  async () => {
    try { return mcpResult(await callTool('workflow.projects.list')); }
    catch (e) { return mcpError(String(e)); }
  },
);

server.tool(
  'workflow_projects_get',
  'Get a Dune project. Defaults to the current project.',
  { projectId: z.string().optional().describe('Project ID. Omit for current project.') },
  async (args) => {
    try { return mcpResult(await callTool('workflow.projects.get', args)); }
    catch (e) { return mcpError(String(e)); }
  },
);

server.tool(
  'workflow_projects_create',
  'Create a Dune project.',
  {
    name: z.string().describe('Project name'),
    description: z.string().optional().describe('Project description'),
    rootPath: z.string().optional().describe('Absolute path to the project folder on disk'),
  },
  async (args) => {
    try { return mcpResult(await callTool('workflow.projects.create', args)); }
    catch (e) { return mcpError(String(e)); }
  },
);

server.tool(
  'workflow_projects_update',
  'Update a Dune project.',
  {
    projectId: z.string().optional().describe('Project ID. Omit for current project.'),
    name: z.string().optional().describe('New name'),
    description: z.string().optional().describe('New description'),
    rootPath: z.string().optional().describe('Project folder path (can only be set once)'),
  },
  async (args) => {
    try { return mcpResult(await callTool('workflow.projects.update', args)); }
    catch (e) { return mcpError(String(e)); }
  },
);

server.tool(
  'workflow_projects_delete',
  'Delete a Dune project and its agents.',
  { projectId: z.string().optional().describe('Project ID. Omit for current project.') },
  async (args) => {
    try { return mcpResult(await callTool('workflow.projects.delete', args)); }
    catch (e) { return mcpError(String(e)); }
  },
);

// ---------------------------------------------------------------------------
// Workflow — Items
// ---------------------------------------------------------------------------

server.tool(
  'workflow_items_list',
  'List work items for a project.',
  { projectId: z.string().optional().describe('Project ID. Omit for current project.') },
  async (args) => {
    try { return mcpResult(await callTool('workflow.items.list', args)); }
    catch (e) { return mcpError(String(e)); }
  },
);

server.tool(
  'workflow_items_create',
  'Create a work item in a Dune project.',
  {
    title: z.string().describe('Work item title'),
    brief: z.string().optional().describe('Work item brief/description'),
    projectId: z.string().optional().describe('Project ID. Omit for current project.'),
    status: z.enum(['inbox', 'ready']).optional().describe('Initial status (default: inbox)'),
  },
  async (args) => {
    try { return mcpResult(await callTool('workflow.items.create', args)); }
    catch (e) { return mcpError(String(e)); }
  },
);

server.tool(
  'workflow_items_update',
  'Update a Dune work item.',
  {
    itemId: z.string().describe('Work item ID'),
    title: z.string().optional().describe('New title'),
    brief: z.string().optional().describe('New brief'),
  },
  async (args) => {
    try { return mcpResult(await callTool('workflow.items.update', args)); }
    catch (e) { return mcpError(String(e)); }
  },
);

server.tool(
  'workflow_items_move',
  'Move a work item to a new status lane.',
  {
    itemId: z.string().describe('Work item ID'),
    status: z.enum(['inbox', 'ready', 'active', 'review', 'done']).describe('Destination lane'),
    index: z.number().optional().describe('Position within the lane (default: end)'),
  },
  async (args) => {
    try { return mcpResult(await callTool('workflow.items.move', args)); }
    catch (e) { return mcpError(String(e)); }
  },
);

// ---------------------------------------------------------------------------
// Workflow — Tasks
// ---------------------------------------------------------------------------

server.tool(
  'workflow_tasks_add',
  'Add a task/checklist item to a work item.',
  {
    itemId: z.string().describe('Work item ID'),
    title: z.string().describe('Task title'),
  },
  async (args) => {
    try { return mcpResult(await callTool('workflow.tasks.add', args)); }
    catch (e) { return mcpError(String(e)); }
  },
);

server.tool(
  'workflow_tasks_update',
  'Update a task on a work item.',
  {
    itemId: z.string().describe('Work item ID'),
    taskId: z.string().describe('Task ID'),
    title: z.string().optional().describe('New title'),
    notes: z.string().optional().describe('Task notes'),
    status: z.enum(['todo', 'doing', 'blocked', 'review', 'done']).optional().describe('Task status'),
  },
  async (args) => {
    try { return mcpResult(await callTool('workflow.tasks.update', args)); }
    catch (e) { return mcpError(String(e)); }
  },
);

// ---------------------------------------------------------------------------
// Workflow — Work Products
// ---------------------------------------------------------------------------

server.tool(
  'workflow_work_products_add',
  'Add a work product/deliverable to a work item.',
  {
    itemId: z.string().describe('Work item ID'),
    title: z.string().describe('Work product title'),
    body: z.string().describe('Work product content'),
  },
  async (args) => {
    try { return mcpResult(await callTool('workflow.work_products.add', args)); }
    catch (e) { return mcpError(String(e)); }
  },
);

// ---------------------------------------------------------------------------
// Workflow — Feedback
// ---------------------------------------------------------------------------

server.tool(
  'workflow_items_add_feedback',
  'Add feedback to a work item. Used by reviewers to approve, reject, or comment.',
  {
    itemId: z.string().describe('Work item ID'),
    feedback: z.string().describe('Feedback text (e.g. "Agent review: approved" or "Rejected: missing tests")'),
  },
  async (args) => {
    try { return mcpResult(await callTool('workflow.items.add_feedback', args)); }
    catch (e) { return mcpError(String(e)); }
  },
);

// ---------------------------------------------------------------------------
// Workflow — Assignments
// ---------------------------------------------------------------------------

server.tool(
  'workflow_assignments_set_primary_agent',
  'Assign a primary agent to a work item.',
  {
    itemId: z.string().describe('Work item ID'),
    agentId: z.string().describe('Agent ID to assign'),
  },
  async (args) => {
    try { return mcpResult(await callTool('workflow.assignments.set_primary_agent', args)); }
    catch (e) { return mcpError(String(e)); }
  },
);

server.tool(
  'workflow_assignments_clear_primary_agent',
  'Clear the primary agent assignment on a work item.',
  {
    itemId: z.string().describe('Work item ID'),
  },
  async (args) => {
    try { return mcpResult(await callTool('workflow.assignments.clear_primary_agent', args)); }
    catch (e) { return mcpError(String(e)); }
  },
);

// ---------------------------------------------------------------------------
// Agents
// ---------------------------------------------------------------------------

server.tool(
  'agents_list',
  'List agents in the current or specified project.',
  { projectId: z.string().optional().describe('Project ID. Omit for current project.') },
  async (args) => {
    try { return mcpResult(await callTool('agents.list', args)); }
    catch (e) { return mcpError(String(e)); }
  },
);

server.tool(
  'agents_get',
  'Get a Dune agent by ID.',
  { agentId: z.string().describe('Agent ID') },
  async (args) => {
    try { return mcpResult(await callTool('agents.get', args)); }
    catch (e) { return mcpError(String(e)); }
  },
);

server.tool(
  'agents_create',
  'Create a new agent in a Dune project.',
  {
    name: z.string().describe('Agent name'),
    projectId: z.string().optional().describe('Project ID. Omit for current project.'),
    channelId: z.string().optional().describe('Channel type (default: dune-chat)'),
  },
  async (args) => {
    try { return mcpResult(await callTool('agents.create', args)); }
    catch (e) { return mcpError(String(e)); }
  },
);

server.tool(
  'agents_delete',
  'Delete a Dune agent.',
  { agentId: z.string().describe('Agent ID') },
  async (args) => {
    try { return mcpResult(await callTool('agents.delete', args)); }
    catch (e) { return mcpError(String(e)); }
  },
);

server.tool(
  'agents_ensure_project_main',
  'Ensure the project has a project-main coordinator agent.',
  {
    projectId: z.string().optional().describe('Project ID. Omit for current project.'),
    projectName: z.string().optional().describe('Project name (if known)'),
  },
  async (args) => {
    try { return mcpResult(await callTool('agents.ensure_project_main', args)); }
    catch (e) { return mcpError(String(e)); }
  },
);

// ---------------------------------------------------------------------------
// Runtime
// ---------------------------------------------------------------------------

server.tool(
  'runtime_get_snapshot',
  'Get a sanitized snapshot of the Dune runtime state.',
  {},
  async () => {
    try { return mcpResult(await callTool('runtime.get_snapshot')); }
    catch (e) { return mcpError(String(e)); }
  },
);

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

const transport = new StdioServerTransport();
await server.connect(transport);
