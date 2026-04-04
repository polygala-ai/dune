import type {
  AgentServiceListener,
  AgentServiceSnapshot,
} from '@/renderer/features/agents/model/agent-service';
import { createMockAgentRuntime, type AgentRuntime } from '@/renderer/features/agents/services/mock-agent-service';
import type { CreateAgentInput } from '@/renderer/features/agents/types';
import {
  AgentLiteHost,
  resolveAgentLiteRuntimeRoot,
  type AgentLiteHostOptions,
} from '@/electron/runtime-core/agentlite-host';

type ActiveRuntime = AgentRuntime & {
  reloadExternalChannels?: () => Promise<void>;
  shutdown?: () => Promise<void>;
};

type RealRuntime = ActiveRuntime & {
  start: () => Promise<void>;
};

export interface DesktopRuntimeControllerOptions
  extends AgentLiteHostOptions {
  createRealRuntime?: (options: DesktopRuntimeControllerOptions) => RealRuntime;
}

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

  getSnapshot() {
    return this.activeRuntime.getSnapshot();
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

  async deleteAgent(agentId: string) {
    await this.activeRuntime.service.deleteAgent(agentId);
  }

  async reloadExternalChannels() {
    await this.activeRuntime.reloadExternalChannels?.();
  }

  async sendAgentMessage(agentId: string, text: string) {
    await this.activeRuntime.service.sendMessage(agentId, text);
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
