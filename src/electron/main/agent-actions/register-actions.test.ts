import { describe, expect, it, vi } from 'vitest';

import type { Agent as AgentLiteAgent } from '@boxlite-ai/agentlite';

import {
  registerDuneActions,
  type ActionHostServices,
} from './register-actions';

describe('registerDuneActions', () => {
  it('does not register removed coding_engine actions', () => {
    const action = vi.fn();
    const agent = { action } as unknown as AgentLiteAgent;
    const services = {
      getRuntimeController: () => ({}),
      onWorkflowChanged: () => undefined,
      workflowStore: {
        delete: async () => undefined,
        get: async () => null,
        keys: async () => [],
        set: async () => undefined,
      },
    } as unknown as ActionHostServices;

    registerDuneActions(agent, services, {
      agentId: 'agent-1',
      agentName: 'Navigator',
      duneMountContainerDir: '/workspace/extra/dune/',
      duneMountHostDir: '/tmp/dune',
      projectId: 'project-1',
    });

    const actionNames = action.mock.calls.map(([name]) => name as string);

    expect(actionNames).toContain('workflow_projects_list');
    expect(actionNames).toContain('workflow_items_add_dependency');
    expect(actionNames).toContain('workflow_items_remove_dependency');
    expect(actionNames).not.toContain('coding_engine_claude_code');
    expect(actionNames).not.toContain('coding_engine_codex');
    expect(actionNames).not.toContain('coding_engine_poll');
  });
});
