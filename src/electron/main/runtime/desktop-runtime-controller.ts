// Desktop runtime controller and backend fallback wiring.

import type {
  AgentRuntimeContract,
  AgentServiceListener,
  AgentServiceSnapshot,
} from '@/shared/agents/agent-runtime';
import type { AgentActivitySnapshot } from '@/shared/agents/agent-activity';
import { createMockAgentRuntime } from '@/renderer/features/agents/services/mock-agent-service';
import type {
  AgentDefinition,
  RunIsolatedResearchInput,
  CreateAgentInput,
  StartTelegramSetupSessionInput,
  UpdateAgentChannelInput,
} from '@/renderer/features/agents/types';
import {
  AgentRuntime,
  resolveAgentLiteRuntimeRoot,
  type AgentRuntimeOptions,
} from './agent-runtime';

/** Active runtime shape. */
type ActiveRuntime = AgentRuntimeContract & {
  getAgentActivitySnapshot?: () => Promise<AgentActivitySnapshot>;
  getAgentActivityWatchTargets?: () => Array<{ agentId: string; dataDir: string }>;
  reloadExternalChannels?: () => Promise<void>;
  shutdown?: () => Promise<void>;
};

/** Real runtime shape. */
type RealRuntime = ActiveRuntime & {
  start: () => Promise<void>;
};

/** Desktop runtime controller options. */
export interface DesktopRuntimeControllerOptions
  extends AgentRuntimeOptions {
  createRealRuntime?: (options: DesktopRuntimeControllerOptions) => RealRuntime;
}

/** Coordinates desktop runtime. */
export class DesktopRuntimeController {
  private activeRuntime: ActiveRuntime;

  private activeRuntimeUnsubscribe: (() => void) | null = null;

  private readonly createRealRuntime: (options: DesktopRuntimeControllerOptions) => RealRuntime;

  private readonly listeners = new Set<AgentServiceListener>();

  private readonly runtimeRoot: string;

  private readonly runtimeOptions: DesktopRuntimeControllerOptions;

  private shutdownPromise: Promise<void> | null = null;

  constructor(options: DesktopRuntimeControllerOptions) {
    this.runtimeRoot = resolveAgentLiteRuntimeRoot(options.homeDir);
    this.runtimeOptions = options;
    this.createRealRuntime =
      options.createRealRuntime ??
      ((runtimeOptions) => new AgentRuntime(runtimeOptions));
    this.activeRuntime = createMockAgentRuntime({
      message: 'Starting Dune runtime.',
      mode: 'mock-fallback',
      rootPath: this.runtimeRoot,
      status: 'starting',
    });
    this.subscribeToActiveRuntime();
  }

  /** Starts desktop runtime. */
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

  /** Returns snapshot. */
  getSnapshot(): AgentServiceSnapshot {
    return this.activeRuntime.getSnapshot();
  }

  /** Returns normalized agent activity records for the renderer/watcher. */
  async getAgentActivitySnapshot(): Promise<AgentActivitySnapshot> {
    return this.activeRuntime.getAgentActivitySnapshot?.() ?? { agents: [] };
  }

  /** Returns live watch targets for per-agent activity status files. */
  getAgentActivityWatchTargets(): Array<{ agentId: string; dataDir: string }> {
    return this.activeRuntime.getAgentActivityWatchTargets?.() ?? [];
  }

  /** Subscribes to desktop runtime updates. */
  subscribe(listener: AgentServiceListener) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Creates agent. */
  async createAgent(input: CreateAgentInput) {
    return this.activeRuntime.service.createAgent(input);
  }

  /** Cancels Telegram setup session. */
  async cancelTelegramSetupSession(sessionId: string) {
    await this.activeRuntime.service.cancelTelegramSetupSession(sessionId);
  }

  /** Deletes agent. */
  async deleteAgent(agentId: string) {
    await this.activeRuntime.service.deleteAgent(agentId);
  }

  /** Ensures project main agent. */
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

  /** Returns Telegram setup session. */
  async getTelegramSetupSession(sessionId: string) {
    return this.activeRuntime.service.getTelegramSetupSession(sessionId);
  }

  /** Returns one lazy transcript page for an agent. */
  async getTranscriptPage(
    agentId: string,
    options?: { beforeMessageId?: string | null; limit?: number },
  ) {
    return this.activeRuntime.service.getTranscriptPage(agentId, options);
  }

  /** Reloads external channels. */
  async reloadExternalChannels() {
    await this.activeRuntime.reloadExternalChannels?.();
  }

  /** Runs an isolated multi-target research pass and reduces the results. */
  async runIsolatedResearch(agentId: string, input: RunIsolatedResearchInput) {
    return this.activeRuntime.service.runIsolatedResearch(agentId, input);
  }

  /** Sends agent message. */
  async sendAgentMessage(agentId: string, text: string) {
    await this.activeRuntime.service.sendMessage(agentId, text);
  }

  /** Schedules a work-item assignment task on the agent's agentlite runtime. */
  async scheduleItemAssignment(agentId: string, itemId: string): Promise<string | null> {
    return this.activeRuntime.service.scheduleItemAssignment(agentId, itemId);
  }

  /** Cancels a previously scheduled work-item assignment task. */
  async cancelItemAssignment(agentId: string, taskId: string): Promise<void> {
    await this.activeRuntime.service.cancelItemAssignment(agentId, taskId);
  }

  /** Returns true when the task still exists and remains active in agentlite. */
  isItemTaskKnown(agentId: string, taskId: string): boolean {
    return this.activeRuntime.service.isItemTaskKnown(agentId, taskId);
  }

  /** Starts Telegram setup session. */
  async startTelegramSetupSession(input: StartTelegramSetupSessionInput) {
    return this.activeRuntime.service.startTelegramSetupSession(input);
  }

  /** Updates agent channel. */
  async updateAgentChannel(input: UpdateAgentChannelInput) {
    await this.activeRuntime.service.updateAgentChannel(input);
  }

  /** Updates agent definition (archetype + responsibilities). */
  async updateAgentDefinition(agentId: string, definition: AgentDefinition) {
    await this.activeRuntime.service.updateAgentDefinition(agentId, definition);
  }

  /** Posts a system-role message to an agent so it processes it as context. */
  async postSystemMessage(agentId: string, body: string) {
    await this.activeRuntime.service.postSystemMessage(agentId, body);
  }

  /** Selects agent. */
  selectAgent(agentId: string) {
    this.activeRuntime.service.selectAgent(agentId);
  }

  /** Resets desktop runtime. */
  async reset() {
    if (typeof this.activeRuntime.reset === 'function') {
      this.activeRuntime.reset();
    }
  }

  /** Shuts down desktop runtime. */
  shutdown(): Promise<void> {
    if (this.shutdownPromise) {
      return this.shutdownPromise;
    }

    this.shutdownPromise = (async () => {
      this.activeRuntimeUnsubscribe?.();
      this.activeRuntimeUnsubscribe = null;

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
