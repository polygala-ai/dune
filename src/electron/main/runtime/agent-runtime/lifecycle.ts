// Agent runtime lifecycle tracking.

import type { AgentLite } from '@boxlite-ai/agentlite';

import type { DuneAgent } from '../dune-agent';

/**
 * State for the AgentLite SDK and the per-agent DuneAgent runtimes that
 * live inside it.
 *
 * Two layers of "instance + in-flight start promise" coexist here:
 * - The SDK engine itself: created once at boot, reused for every agent.
 * - The per-agent runtime: one DuneAgent per Dune agent, started lazily
 *   the first time the agent is touched.
 *
 * Both layers track their in-flight startup so concurrent callers don't
 * race to create the same thing twice.
 *
 * This class is a state container only — the actual startup logic
 * (lock retry, instance construction) lives in the host class. The host
 * uses these methods to coordinate multi-caller starts safely.
 */
export class Lifecycle {
  private engine: AgentLite | null = null;

  private engineStart: Promise<AgentLite> | null = null;

  private readonly runtimes = new Map<string, DuneAgent>();

  private readonly runtimeStarts = new Map<string, Promise<DuneAgent>>();

  // ---------- Engine ----------

  /** Get the running engine, or null if it hasn't started. */
  getEngine(): AgentLite | null {
    return this.engine;
  }

  /** True if the engine has finished starting. */
  isEngineReady(): boolean {
    return this.engine !== null;
  }

  /** Record the engine after a successful start. */
  setEngine(engine: AgentLite): void {
    this.engine = engine;
  }

  /** Get the in-flight engine-start promise, if any. */
  getInFlightEngineStart(): Promise<AgentLite> | null {
    return this.engineStart;
  }

  /** Track an in-flight engine start so concurrent callers can join it. */
  beginEngineStart(promise: Promise<AgentLite>): void {
    this.engineStart = promise;
  }

  /** Clear the in-flight engine start (success or failure). */
  endEngineStart(promise: Promise<AgentLite>): void {
    if (this.engineStart === promise) {
      this.engineStart = null;
    }
  }

  // ---------- Per-agent runtimes ----------

  /** Returns runtime. */
  getRuntime(agentId: string): DuneAgent | undefined {
    return this.runtimes.get(agentId);
  }

  /** Returns whether runtime exist. */
  hasRuntime(agentId: string): boolean {
    return this.runtimes.has(agentId);
  }

  /** Sets runtime. */
  setRuntime(agentId: string, runtime: DuneAgent): void {
    this.runtimes.set(agentId, runtime);
  }

  /** Deletes runtime. */
  deleteRuntime(agentId: string): void {
    this.runtimes.delete(agentId);
  }

  /** Get the in-flight runtime-start promise for an agent, if any. */
  getInFlightRuntimeStart(agentId: string): Promise<DuneAgent> | undefined {
    return this.runtimeStarts.get(agentId);
  }

  /** Begins runtime start. */
  beginRuntimeStart(agentId: string, promise: Promise<DuneAgent>): void {
    this.runtimeStarts.set(agentId, promise);
  }

  /** Ends runtime start. */
  endRuntimeStart(agentId: string, promise: Promise<DuneAgent>): void {
    if (this.runtimeStarts.get(agentId) === promise) {
      this.runtimeStarts.delete(agentId);
    }
  }

  /** Returns all active runtimes. */
  allRuntimes(): IterableIterator<[string, DuneAgent]> {
    return this.runtimes.entries();
  }

  // ---------- Wholesale operations ----------

  /**
   * Stop the engine (best effort) and forget all state. Used during
   * shutdown so a subsequent start gets a fresh slate.
   */
  async stop(): Promise<void> {
    try {
      await this.engine?.stop();
    } finally {
      this.engine = null;
      this.engineStart = null;
      this.runtimes.clear();
      this.runtimeStarts.clear();
    }
  }

  /**
   * Forget all per-agent runtimes (but keep the engine running). Used
   * during in-process reset() so the engine itself survives.
   */
  clearRuntimes(): void {
    this.runtimes.clear();
    this.runtimeStarts.clear();
  }

  /** Best-effort SDK-side delete of a single agent's group folder. */
  async deleteSdkAgent(groupFolder: string): Promise<void> {
    await this.engine?.deleteAgent(groupFolder);
  }
}
