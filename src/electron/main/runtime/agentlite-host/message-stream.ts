/**
 * Per-agent assistant message buffer.
 *
 * While an agent is streaming a reply we hold an entry here with the message
 * id and two cancellable timers:
 * - `idleTimer` finalizes the reply if the agent stops emitting chunks
 *   (default ~320ms after the last chunk).
 * - `safetyTimer` finalizes the reply if the agent never emits another chunk
 *   at all (a much longer fallback so dead streams don't sit forever).
 *
 * Only ONE pending entry exists per agent at a time. The presence of an
 * entry IS the "is currently streaming" signal.
 */
export interface PendingAssistantMessage {
  idleTimer: ReturnType<typeof globalThis.setTimeout> | null;
  messageId: string;
  safetyTimer: ReturnType<typeof globalThis.setTimeout> | null;
}

export class MessageStream {
  private readonly pending = new Map<string, PendingAssistantMessage>();

  /** True if ANY agent is currently streaming a reply. */
  get isStreaming(): boolean {
    return this.pending.size > 0;
  }

  /** True if THIS agent is currently streaming. */
  has(agentId: string): boolean {
    return this.pending.has(agentId);
  }

  /** Look up the pending stream entry for an agent, or null. */
  get(agentId: string): PendingAssistantMessage | null {
    return this.pending.get(agentId) ?? null;
  }

  /**
   * Set or replace the pending entry for an agent. Used both for begin
   * (no timers yet) and for replacing the entry with a new timer attached.
   */
  set(agentId: string, message: PendingAssistantMessage): void {
    this.pending.set(agentId, message);
  }

  /**
   * Stop tracking an agent's stream. Cancels any pending timers first so
   * they don't fire after the entry is gone.
   */
  forget(agentId: string): void {
    const entry = this.pending.get(agentId);
    if (!entry) return;
    if (entry.idleTimer) globalThis.clearTimeout(entry.idleTimer);
    if (entry.safetyTimer) globalThis.clearTimeout(entry.safetyTimer);
    this.pending.delete(agentId);
  }

  /** Stop tracking every agent. Used on reset/shutdown. */
  clear(): void {
    for (const entry of this.pending.values()) {
      if (entry.idleTimer) globalThis.clearTimeout(entry.idleTimer);
      if (entry.safetyTimer) globalThis.clearTimeout(entry.safetyTimer);
    }
    this.pending.clear();
  }
}
