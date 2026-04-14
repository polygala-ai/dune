// Indexed agent-record collection helpers.

import type { PersistedAgentRecord } from './records';

/**
 * In-memory cache of persisted agent records, keyed by agent id.
 *
 * This is the host-side "registry" of agents that have been loaded from
 * AgentStorage. Each record is the canonical truth for what an agent IS;
 * the snapshot exposed to the renderer is computed from these records
 * plus volatile state held elsewhere (MessageStream, Lifecycle, etc.).
 *
 * The class enforces one invariant the raw Map cannot: a record is
 * always stored under its own agent id, so callers can't accidentally
 * key a record under the wrong id.
 */
export class AgentRecords {
  private readonly records = new Map<string, PersistedAgentRecord>();

  // ---------- Lookup ----------

  /** Returns agent. */
  get(agentId: string): PersistedAgentRecord | undefined {
    return this.records.get(agentId);
  }

  /** Returns whether agent exist. */
  has(agentId: string): boolean {
    return this.records.has(agentId);
  }

  // ---------- Iteration ----------

  /** Valueses agent. */
  values(): IterableIterator<PersistedAgentRecord> {
    return this.records.values();
  }

  /** Entrieses agent. */
  entries(): IterableIterator<[string, PersistedAgentRecord]> {
    return this.records.entries();
  }

  /** Converts to array. */
  toArray(): PersistedAgentRecord[] {
    return [...this.records.values()];
  }

  // ---------- Derived queries ----------

  /** All records belonging to a specific project. */
  byProject(projectId: string): PersistedAgentRecord[] {
    return this.toArray().filter((record) => record.agent.projectId === projectId);
  }

  // ---------- Mutation ----------

  /**
   * Store a record under its own agent id. Pass the record only — the id
   * is derived from `record.agent.id` so it can never disagree with the key.
   */
  set(record: PersistedAgentRecord): void {
    this.records.set(record.agent.id, record);
  }

  /** Deletes agent. */
  delete(agentId: string): void {
    this.records.delete(agentId);
  }

  /** Clears agent. */
  clear(): void {
    this.records.clear();
  }
}
