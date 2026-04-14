import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createAgentIpcDirectoryMetadata,
  resolveAgentIpcDir,
  resolveAgentIpcMetadataPath,
} from '@/electron/shared/agent-ipc/ipc-directory';
import { AgentIpcManager } from './agent-ipc-manager';

function createTempHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'dune-ipc-mgr-'));
}

function setupIpcDir(homeDir: string, projectId: string, agentName: string) {
  const ipcDir = path.join(homeDir, '.dune', 'projs', projectId, 'agents', agentName, 'ipc');
  fs.mkdirSync(path.join(ipcDir, 'agent'), { recursive: true });
  fs.mkdirSync(path.join(ipcDir, 'host'), { recursive: true });
  return ipcDir;
}

function setupSanitizedIpcDir(
  homeDir: string,
  projectId: string,
  projectName: string,
  agentId: string,
  agentName: string,
) {
  const ipcDir = resolveAgentIpcDir(homeDir, projectId, projectName, agentName, agentId);
  fs.mkdirSync(path.join(ipcDir, 'agent'), { recursive: true });
  fs.mkdirSync(path.join(ipcDir, 'host'), { recursive: true });
  fs.writeFileSync(
    resolveAgentIpcMetadataPath(ipcDir),
    `${JSON.stringify(
      createAgentIpcDirectoryMetadata(projectId, agentId, agentName, projectName),
      null,
      2,
    )}\n`,
  );
  return ipcDir;
}

describe('AgentIpcManager', () => {
  let homeDir: string;
  let manager: AgentIpcManager;

  beforeEach(() => {
    homeDir = createTempHome();
  });

  afterEach(() => {
    manager?.stop();
    fs.rmSync(homeDir, { recursive: true, force: true });
  });

  it('discovers agents with IPC directories on start', () => {
    setupIpcDir(homeDir, 'project-1', 'agent-a');
    setupIpcDir(homeDir, 'project-1', 'agent-b');

    manager = new AgentIpcManager(homeDir);
    manager.start();

    const agents = manager.toSnapshotAgents();
    expect(agents).toHaveLength(2);
    expect(agents.map((a) => a.id).sort()).toEqual([
      'ipc:project-1:agent-a',
      'ipc:project-1:agent-b',
    ]);
  });

  it('returns empty when no projs directory exists', () => {
    manager = new AgentIpcManager(homeDir);
    manager.start();

    expect(manager.toSnapshotAgents()).toEqual([]);
  });

  it('discovers sanitized IPC directories using metadata', () => {
    setupSanitizedIpcDir(
      homeDir,
      'project / 1',
      'Research Platform',
      'dune:agent:test-a',
      'agent / a',
    );

    manager = new AgentIpcManager(homeDir);
    manager.start();

    expect(manager.toSnapshotAgents()).toEqual([
      expect.objectContaining({
        id: 'ipc:project / 1:agent / a',
        name: 'agent / a',
        projectId: 'project / 1',
      }),
    ]);
  });

  it('delivers a message to the correct agent', () => {
    const ipcDir = setupIpcDir(homeDir, 'project-1', 'my-agent');
    manager = new AgentIpcManager(homeDir);
    manager.start();

    manager.sendMessage('ipc:project-1:my-agent', 'hello');

    const files = fs.readdirSync(path.join(ipcDir, 'host'));
    expect(files).toHaveLength(1);
    const content = JSON.parse(fs.readFileSync(path.join(ipcDir, 'host', files[0]!), 'utf-8'));
    expect(content.type).toBe('user-message');
    expect(content.payload.text).toBe('hello');
  });

  it('throws when sending to a non-existent agent', () => {
    manager = new AgentIpcManager(homeDir);
    manager.start();

    expect(() => manager.sendMessage('ipc:nope:nope', 'hi')).toThrow('IPC agent not found');
  });

  it('dynamically adds connections via addConnection', () => {
    manager = new AgentIpcManager(homeDir);
    manager.start();
    expect(manager.toSnapshotAgents()).toHaveLength(0);

    const ipcDir = setupIpcDir(homeDir, 'project-2', 'dynamic-agent');
    manager.addConnection('ipc:project-2:dynamic-agent', 'dynamic-agent', 'project-2', ipcDir, '/workspace/extra/dune/ipc/');

    expect(manager.toSnapshotAgents()).toHaveLength(1);
    expect(manager.toSnapshotAgents()[0]!.id).toBe('ipc:project-2:dynamic-agent');

    // Can send messages to the dynamically added agent
    manager.sendMessage('ipc:project-2:dynamic-agent', 'hello dynamic');
    const files = fs.readdirSync(path.join(ipcDir, 'host'));
    expect(files).toHaveLength(1);
  });

  it('replaces a scanned legacy connection when the runtime registers the same agent', () => {
    setupIpcDir(homeDir, 'project-2', 'dynamic-agent');

    manager = new AgentIpcManager(homeDir);
    manager.start();
    expect(manager.toSnapshotAgents()).toHaveLength(1);

    const sanitizedIpcDir = setupSanitizedIpcDir(
      homeDir,
      'project-2',
      'Dynamic Project',
      'dune:agent:dynamic-agent',
      'dynamic-agent',
    );
    manager.addConnection('dune:agent:runtime', 'dynamic-agent', 'project-2', sanitizedIpcDir, '/workspace/extra/dune/ipc/');

    expect(manager.toSnapshotAgents()).toEqual([
      expect.objectContaining({
        id: 'dune:agent:runtime',
        name: 'dynamic-agent',
        projectId: 'project-2',
      }),
    ]);

    manager.sendMessage('dune:agent:runtime', 'hello runtime');
    expect(fs.readdirSync(path.join(sanitizedIpcDir, 'host'))).toHaveLength(1);
  });

  it('addConnection starts watching the agent dir', () => {
    const ipcDir = setupIpcDir(homeDir, 'project-3', 'new-agent');
    manager = new AgentIpcManager(homeDir);
    manager.start();
    manager.addConnection('ipc:project-3:new-agent', 'new-agent', 'project-3', ipcDir, '/workspace/extra/dune/ipc/');

    expect(manager.toSnapshotAgents()).toHaveLength(1);
  });

  it('maps agents to snapshot format', () => {
    setupIpcDir(homeDir, 'project-1', 'worker');
    manager = new AgentIpcManager(homeDir);
    manager.start();

    const agents = manager.toSnapshotAgents();
    expect(agents).toHaveLength(1);
    expect(agents[0]).toEqual(expect.objectContaining({
      id: 'ipc:project-1:worker',
      name: 'worker',
      status: 'ready',
      channel: expect.objectContaining({ id: 'dune-chat' }),
      messages: [],
    }));
  });

  it('propagates tool message handler factories to connections', () => {
    const ipcDir = setupIpcDir(homeDir, 'project-1', 'board-agent');
    manager = new AgentIpcManager(homeDir);

    const toolHandlerFactory = vi.fn(() => vi.fn((_msg, _fileId, replyFn) => {
      replyFn({ type: 'tools/list-result', payload: { tools: [] } });
    }));
    manager.setToolMessageHandler(toolHandlerFactory);
    manager.start();

    expect(toolHandlerFactory).toHaveBeenCalledWith(
      expect.objectContaining({
        agentId: 'ipc:project-1:board-agent',
        agentName: 'board-agent',
        projectId: 'project-1',
        ipcContainerDir: '/workspace/extra/dune/ipc/',
      }),
    );

    // Write a tool message directly.
    fs.writeFileSync(
      path.join(ipcDir, 'agent', `${Date.now()}-cmd.json`),
      JSON.stringify({ type: 'tools/list', payload: {} }),
    );

    const replyFiles = fs.readdirSync(path.join(ipcDir, 'host'));
    expect(replyFiles).toEqual([]);
  });
});
