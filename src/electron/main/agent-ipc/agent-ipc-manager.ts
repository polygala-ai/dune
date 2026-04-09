import fs from 'node:fs';
import path from 'node:path';

import type { Agent, AgentMessage } from '@/renderer/features/agents/types';

import {
  AgentIpcConnection,
  type AgentIpcConnectionState,
  type BoardMessageHandler,
} from './agent-ipc-connection';

export type AgentIpcManagerListener = () => void;

interface ManagedAgent {
  agentId: string;
  agentName: string;
  projectId: string;
  connection: AgentIpcConnection;
}

export class AgentIpcManager {
  private readonly managedAgents = new Map<string, ManagedAgent>();

  private listeners = new Set<AgentIpcManagerListener>();

  private boardMessageHandler: BoardMessageHandler | null = null;

  constructor(private readonly duneHome: string) {}

  setBoardMessageHandler(handler: BoardMessageHandler): void {
    this.boardMessageHandler = handler;
    for (const managed of this.managedAgents.values()) {
      managed.connection.setBoardMessageHandler(handler);
    }
  }

  start(): void {
    this.scanForAgents();
  }

  /** Register a new IPC connection for a dynamically created agent. */
  addConnection(agentId: string, agentName: string, projectId: string, ipcHostPath: string): void {
    if (this.managedAgents.has(agentId)) return;

    const agentSubDir = path.join(ipcHostPath, 'agent');
    const hostSubDir = path.join(ipcHostPath, 'host');

    const connection = new AgentIpcConnection(
      agentSubDir,
      hostSubDir,
      () => this.emit(),
    );
    if (this.boardMessageHandler) {
      connection.setBoardMessageHandler(this.boardMessageHandler);
    }
    connection.start();
    connection.scan();

    this.managedAgents.set(agentId, {
      agentId,
      agentName,
      projectId,
      connection,
    });
  }

  stop(): void {
    for (const agent of this.managedAgents.values()) {
      agent.connection.stop();
    }
    this.managedAgents.clear();
  }

  subscribe(listener: AgentIpcManagerListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  sendMessage(agentId: string, text: string): void {
    const agent = this.managedAgents.get(agentId);
    if (!agent) {
      throw new Error(`IPC agent not found: ${agentId}`);
    }
    agent.connection.deliverMessage(text);
  }

  hasStreamingAgents(): boolean {
    for (const agent of this.managedAgents.values()) {
      if (agent.connection.getState().isStreaming) return true;
    }
    return false;
  }

  toSnapshotAgents(): Agent[] {
    const result: Agent[] = [];
    for (const managed of this.managedAgents.values()) {
      const state = managed.connection.getState();
      result.push(
        toAgent(managed.agentId, managed.agentName, managed.projectId, state),
      );
    }
    return result;
  }

  // Scan ~/.dune/projs/*/agents/*/ipc/ for IPC directories
  private scanForAgents(): void {
    const projsDir = path.join(this.duneHome, '.dune', 'projs');
    if (!fs.existsSync(projsDir)) return;

    let projNames: string[];
    try {
      projNames = fs.readdirSync(projsDir);
    } catch {
      return;
    }

    for (const projName of projNames) {
      const agentsDir = path.join(projsDir, projName, 'agents');
      if (!fs.existsSync(agentsDir)) continue;

      let agentNames: string[];
      try {
        agentNames = fs.readdirSync(agentsDir);
      } catch {
        continue;
      }

      for (const agentName of agentNames) {
        const ipcDir = path.join(agentsDir, agentName, 'ipc');
        if (!fs.existsSync(ipcDir)) continue;

        const agentId = `ipc:${projName}:${agentName}`;
        if (this.managedAgents.has(agentId)) continue;

        const agentSubDir = path.join(ipcDir, 'agent');
        const hostSubDir = path.join(ipcDir, 'host');

        const connection = new AgentIpcConnection(
          agentSubDir,
          hostSubDir,
          () => this.emit(),
        );
        if (this.boardMessageHandler) {
          connection.setBoardMessageHandler(this.boardMessageHandler);
        }
        connection.start();

        this.managedAgents.set(agentId, {
          agentId,
          agentName,
          projectId: projName,
          connection,
        });
      }
    }
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}

function toAgent(
  agentId: string,
  agentName: string,
  projectId: string,
  state: AgentIpcConnectionState,
): Agent {
  const messages: AgentMessage[] = state.messages.map((m) => ({
    attachments: [],
    id: m.id,
    role: m.role,
    content: m.content,
    createdAt: m.createdAt,
    format: 'markdown',
    status: m.status,
  }));

  const lastMessage = messages.at(-1);

  return {
    id: agentId,
    name: agentName,
    preview: lastMessage?.content.slice(0, 100) ?? '',
    channel: {
      id: 'dune-chat',
      kind: 'built-in',
      label: 'IPC',
      status: 'ready',
      canCompose: true,
    },
    note: '',
    projectId,
    role: 'custom',
    status: state.isStreaming ? 'live' : 'ready',
    telegram: null,
    updatedAt: lastMessage?.createdAt ?? Date.now(),
    workspace: '',
    contextCards: [],
    messages,
  };
}
