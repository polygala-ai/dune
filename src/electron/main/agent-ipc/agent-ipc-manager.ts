// Filesystem IPC manager for live agent sessions.

import fs from 'node:fs';
import path from 'node:path';

import {
  parseAgentIpcDirectoryMetadata,
  resolveAgentIpcMetadataPath,
} from './ipc-directory';
import type { Agent, AgentMessage } from '@/renderer/features/agents/types';

import {
  AgentIpcConnection,
  type AgentIpcConnectionState,
  type ToolHandlerContext,
  type ToolMessageHandler,
} from './agent-ipc-connection';

/** Agent IPC manager listener shape. */
export type AgentIpcManagerListener = () => void;
/** Tool message handler factory shape. */
export type ToolMessageHandlerFactory = (context: ToolHandlerContext) => ToolMessageHandler;

/** Managed agent shape. */
interface ManagedAgent {
  agentId: string;
  agentName: string;
  projectId: string;
  ipcHostDir: string;
  ipcContainerDir: string;
  connection: AgentIpcConnection;
}

/** Manages agent IPC. */
export class AgentIpcManager {
  private readonly managedAgents = new Map<string, ManagedAgent>();

  private listeners = new Set<AgentIpcManagerListener>();

  private toolMessageHandlerFactory: ToolMessageHandlerFactory | null = null;

  constructor(private readonly duneHome: string) {}

  /** Sets tool message handler. */
  setToolMessageHandler(handlerFactory: ToolMessageHandlerFactory): void {
    this.toolMessageHandlerFactory = handlerFactory;
    for (const managed of this.managedAgents.values()) {
      managed.connection.setToolMessageHandler(
        handlerFactory(createToolHandlerContext(managed)),
      );
    }
  }

  /**
   * Container-side path to the scanned agent's IPC directory. Scans only walk
   * non-project-main agent dirs (`<projsDir>/<proj>/agents/<agent>/ipc/`), where
   * `duneMountRoot === agentDir` and the IPC subdir is always `ipc`, so the
   * container path is always `/workspace/extra/dune/ipc/`.
   */
  private static readonly SCANNED_IPC_CONTAINER_PATH = '/workspace/extra/dune/ipc/';

  /** Starts agent IPC. */
  start(): void {
    this.scanForAgents();
  }

  /** Register a new IPC connection for a dynamically created agent. */
  addConnection(
    agentId: string,
    agentName: string,
    projectId: string,
    ipcHostPath: string,
    ipcContainerPath: string,
  ): void {
    const existing = this.findManagedAgent(projectId, agentName);

    if (existing) {
      if (existing.agentId === agentId) return;

      existing.connection.stop();
      this.managedAgents.delete(existing.agentId);
    } else if (this.managedAgents.has(agentId)) {
      return;
    }

    // Wipe stale coding-engine logs from prior sessions. One call at startup,
    // no retention timer or LRU.
    try {
      fs.rmSync(path.join(ipcHostPath, 'coding-engines'), { force: true, recursive: true });
    } catch {
      // Ignore — directory may not exist yet.
    }

    const connection = this.createConnection(
      agentId,
      agentName,
      projectId,
      ipcHostPath,
      ipcContainerPath,
    );
    connection.scan();

    this.managedAgents.set(agentId, {
      agentId,
      agentName,
      projectId,
      ipcHostDir: ipcHostPath,
      ipcContainerDir: ipcContainerPath,
      connection,
    });
  }

  /** Stops agent IPC. */
  stop(): void {
    for (const agent of this.managedAgents.values()) {
      agent.connection.stop();
    }
    this.managedAgents.clear();
  }

  /** Subscribes to agent IPC updates. */
  subscribe(listener: AgentIpcManagerListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Sends message. */
  sendMessage(agentId: string, text: string): void {
    const agent = this.managedAgents.get(agentId);
    if (!agent) {
      throw new Error(`IPC agent not found: ${agentId}`);
    }
    agent.connection.deliverMessage(text);
  }

  /** Returns whether streaming agents exist. */
  hasStreamingAgents(): boolean {
    for (const agent of this.managedAgents.values()) {
      if (agent.connection.getState().isStreaming) return true;
    }
    return false;
  }

  /** Converts to snapshot agents. */
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

        const identity = resolveAgentIdentity(ipcDir, projName, agentName);
        if (this.findManagedAgent(identity.projectId, identity.agentName)) continue;

        const agentId = `ipc:${identity.projectId}:${identity.agentName}`;
        if (this.managedAgents.has(agentId)) continue;

        const connection = this.createConnection(
          agentId,
          identity.agentName,
          identity.projectId,
          ipcDir,
          AgentIpcManager.SCANNED_IPC_CONTAINER_PATH,
        );

        this.managedAgents.set(agentId, {
          agentId,
          agentName: identity.agentName,
          projectId: identity.projectId,
          ipcHostDir: ipcDir,
          ipcContainerDir: AgentIpcManager.SCANNED_IPC_CONTAINER_PATH,
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

  private createConnection(
    agentId: string,
    agentName: string,
    projectId: string,
    ipcHostPath: string,
    ipcContainerPath: string,
  ): AgentIpcConnection {
    const agentSubDir = path.join(ipcHostPath, 'agent');
    const hostSubDir = path.join(ipcHostPath, 'host');
    const connection = new AgentIpcConnection(
      agentSubDir,
      hostSubDir,
      () => this.emit(),
    );

    if (this.toolMessageHandlerFactory) {
      connection.setToolMessageHandler(
        this.toolMessageHandlerFactory({
          agentId,
          agentName,
          projectId,
          ipcHostDir: ipcHostPath,
          ipcContainerDir: ipcContainerPath,
        }),
      );
    }

    connection.start();
    return connection;
  }

  private findManagedAgent(projectId: string, agentName: string): ManagedAgent | null {
    for (const managed of this.managedAgents.values()) {
      if (managed.projectId === projectId && managed.agentName === agentName) {
        return managed;
      }
    }

    return null;
  }
}

/** Creates tool handler context. */
function createToolHandlerContext(managed: ManagedAgent): ToolHandlerContext {
  return {
    agentId: managed.agentId,
    agentName: managed.agentName,
    projectId: managed.projectId,
    ipcHostDir: managed.ipcHostDir,
    ipcContainerDir: managed.ipcContainerDir,
  };
}

/** Converts to agent. */
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
    activityEvents: [],
    codingEngineEvents: [],
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

/** Resolves agent identity. */
function resolveAgentIdentity(
  ipcDir: string,
  fallbackProjectId: string,
  fallbackAgentName: string,
) {
  try {
    const rawMetadata = fs.readFileSync(resolveAgentIpcMetadataPath(ipcDir), 'utf-8');
    const metadata = parseAgentIpcDirectoryMetadata(rawMetadata);

    if (metadata) {
      return {
        projectId: metadata.projectId,
        agentName: metadata.agentName,
      };
    }
  } catch {
    // Missing or unreadable metadata — fall back to the folder names the caller scanned.
  }

  return {
    projectId: fallbackProjectId,
    agentName: fallbackAgentName,
  };
}
