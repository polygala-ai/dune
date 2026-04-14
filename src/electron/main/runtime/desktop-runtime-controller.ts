import type {
  AgentServiceListener,
  AgentServiceSnapshot,
} from '@/renderer/features/agents/model/agent-service';
import { createMockAgentRuntime, type AgentRuntime } from '@/renderer/features/agents/services/mock-agent-service';
import type {
  CodingEngineEvent,
  CreateAgentInput,
  StartTelegramSetupSessionInput,
  UpdateAgentChannelInput,
} from '@/renderer/features/agents/types';
import type { ReadyAssignmentsInboxSignal } from '@/shared/agents/ready-assignments';
import {
  AgentLiteHost,
  resolveAgentLiteRuntimeRoot,
  type AgentLiteHostOptions,
} from './agentlite-host';
import type { AgentIpcManager } from '@/electron/main/agent-ipc/agent-ipc-manager';

type ActiveRuntime = AgentRuntime & {
  reloadExternalChannels?: () => Promise<void>;
  shutdown?: () => Promise<void>;
};

type RealRuntime = ActiveRuntime & {
  start: () => Promise<void>;
};

export interface DesktopRuntimeControllerOptions
  extends AgentLiteHostOptions {
  agentIpcManager?: AgentIpcManager;
  createRealRuntime?: (options: DesktopRuntimeControllerOptions) => RealRuntime;
}

export class DesktopRuntimeController {
  private activeRuntime: ActiveRuntime;

  private activeRuntimeUnsubscribe: (() => void) | null = null;

  private readonly createRealRuntime: (options: DesktopRuntimeControllerOptions) => RealRuntime;

  private readonly listeners = new Set<AgentServiceListener>();

  private readonly runtimeRoot: string;

  private readonly agentIpcManager: AgentIpcManager | null;

  private readonly runtimeOptions: DesktopRuntimeControllerOptions;

  private shutdownPromise: Promise<void> | null = null;

  constructor(options: DesktopRuntimeControllerOptions) {
    this.runtimeRoot = resolveAgentLiteRuntimeRoot(options.homeDir);
    this.runtimeOptions = options;
    this.agentIpcManager = options.agentIpcManager ?? null;
    this.createRealRuntime =
      options.createRealRuntime ??
      ((runtimeOptions) => new AgentLiteHost(runtimeOptions));
    this.activeRuntime = createMockAgentRuntime({
      message: 'Starting Dune runtime.',
      mode: 'mock-fallback',
      rootPath: this.runtimeRoot,
      status: 'starting',
    });
    this.subscribeToActiveRuntime();
  }

  async start() {
    try {
      const host = this.createRealRuntime(this.runtimeOptions);
      await host.start();
      this.setActiveRuntime(host);
    } catch (error) {
      this.setActiveRuntime(
        createMockAgentRuntime({
          message: `AgentLite is unavailable, so Dune is using the mock runtime. ${String(error)}`,
          mode: 'mock-fallback',
          rootPath: this.runtimeRoot,
          status: 'ready',
        }),
      );
    }
  }

  getSnapshot(): AgentServiceSnapshot {
    return this.activeRuntime.getSnapshot();
  }

  pushCodingEngineEvent(agentId: string, event: CodingEngineEvent) {
    const runtime = this.activeRuntime;

    if (runtime instanceof AgentLiteHost) {
      runtime.pushCodingEngineEvent(agentId, event);
    }
  }

  subscribe(listener: AgentServiceListener) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  async createAgent(input: CreateAgentInput) {
    return this.activeRuntime.service.createAgent(input);
  }

  async cancelTelegramSetupSession(sessionId: string) {
    await this.activeRuntime.service.cancelTelegramSetupSession(sessionId);
  }

  async deleteAgent(agentId: string) {
    await this.activeRuntime.service.deleteAgent(agentId);
  }

  async ensureProjectMainAgent(
    projectId: string,
    projectName: string,
    projectRootPath?: string | null,
  ) {
    return this.activeRuntime.service.ensureProjectMainAgent(
      projectId,
      projectName,
      projectRootPath,
    );
  }

  async getTelegramSetupSession(sessionId: string) {
    return this.activeRuntime.service.getTelegramSetupSession(sessionId);
  }

  async reloadExternalChannels() {
    await this.activeRuntime.reloadExternalChannels?.();
  }

  async sendAgentMessage(agentId: string, text: string) {
    await this.activeRuntime.service.sendMessage(agentId, text);
  }

  async signalReadyAssignmentInbox(agentId: string, signal: ReadyAssignmentsInboxSignal) {
    await this.activeRuntime.service.signalReadyAssignmentInbox(agentId, signal);
  }

  async startTelegramSetupSession(input: StartTelegramSetupSessionInput) {
    return this.activeRuntime.service.startTelegramSetupSession(input);
  }

  async updateAgentChannel(input: UpdateAgentChannelInput) {
    await this.activeRuntime.service.updateAgentChannel(input);
  }

  selectAgent(agentId: string) {
    this.activeRuntime.service.selectAgent(agentId);
  }

  async reset() {
    if (typeof this.activeRuntime.reset === 'function') {
      this.activeRuntime.reset();
    }
  }

  shutdown(): Promise<void> {
    if (this.shutdownPromise) {
      return this.shutdownPromise;
    }

    this.shutdownPromise = (async () => {
      this.activeRuntimeUnsubscribe?.();
      this.activeRuntimeUnsubscribe = null;

      this.agentIpcManager?.stop();

      if (typeof this.activeRuntime.shutdown === 'function') {
        await this.activeRuntime.shutdown();
      }
    })();

    return this.shutdownPromise;
  }

  private emit(snapshot: AgentServiceSnapshot) {
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }

  private setActiveRuntime(runtime: ActiveRuntime) {
    this.activeRuntimeUnsubscribe?.();
    this.activeRuntime = runtime;
    this.subscribeToActiveRuntime();
    this.emit(this.activeRuntime.getSnapshot());
  }

  private subscribeToActiveRuntime() {
    this.activeRuntimeUnsubscribe = this.activeRuntime.subscribe((snapshot) => {
      this.emit(snapshot);
    });
  }
}
