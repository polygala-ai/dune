import { describe, expect, it } from 'vitest';

import { createIpcClaudeMd } from '@/shared/agent-ipc/ipc-claude-md';
import { READY_ASSIGNMENTS_INBOX_MOUNT_PATH } from '@/shared/agents/ready-assignments';

describe('createIpcClaudeMd', () => {
  it('renders the simplified Dune guide with the final IPC mount path', () => {
    const content = createIpcClaudeMd('project-123');

    expect(content).toContain('# Dune Agent Guide');
    expect(content).toContain('Your project ID is `project-123`.');
    expect(content).toContain('`/workspace/extra/dune/`');
    expect(content).toContain('`/workspace/extra/project/`');
    expect(content).toContain(`\`${READY_ASSIGNMENTS_INBOX_MOUNT_PATH}\``);
    expect(content).toContain('`/workspace/extra/dune/ipc/`');
    expect(content).toContain('Call `tools/list` first to discover available tools.');
    expect(content).toContain('Use `workflow.*` tools');
    expect(content).toContain('Use `agents.*` tools for agent creation and lookup.');
    expect(content).toContain('Coordinate through work items, tasks, assignments, and work products.');
    expect(content).toContain('Use `runtime.*` tools only when project or agent tools are not enough.');
  });

  it('supports project-root mounts for main agents', () => {
    const content = createIpcClaudeMd('project-123', {
      ipcMountPath: '/workspace/extra/dune/agents/dune-agent-123/ipc/',
      rootMountPath: '/workspace/extra/dune/',
    });

    expect(content).toContain('`/workspace/extra/dune/`');
    expect(content).toContain('`/workspace/extra/dune/agents/dune-agent-123/ipc/`');
    expect(content).toContain('`/workspace/extra/dune/agents/dune-agent-123/ipc/host/`');
    expect(content).toContain('`/workspace/extra/dune/agents/dune-agent-123/ipc/agent/`');
  });

  it('omits legacy board-specific and admin guidance', () => {
    const content = createIpcClaudeMd('project-123');

    expect(content).not.toContain('/workspace/extra/ipc/');
    expect(content).not.toContain('get-board');
    expect(content).not.toContain('create-item');
    expect(content).not.toContain('move-item');
    expect(content).not.toContain('admin');
    expect(content).not.toContain('agents.send_message');
    expect(content).not.toContain('lookup, and messaging');
  });
});
