// Ready-assignment inbox tracking.

import type { ReadyAssignmentsInboxSignal } from '@/shared/agents/ready-assignments';

/**
 * Tracks ready-assignment inbox signals per agent.
 *
 * Two maps are kept in lockstep:
 * - `pending` holds signals that have been queued but not yet delivered
 *   (because the agent is currently streaming an assistant reply).
 * - `delivered` records the highest generation number already delivered to
 *   each agent, so we can drop stale or duplicate signals on the way in.
 */
export class ReadyInbox {
  private readonly pending = new Map<string, ReadyAssignmentsInboxSignal>();

  private readonly delivered = new Map<string, number>();

  /** Drop everything. Used on reset/shutdown. */
  clear(): void {
    this.pending.clear();
    this.delivered.clear();
  }

  /** Forget a single agent. Used when the agent is deleted. */
  forget(agentId: string): void {
    this.pending.delete(agentId);
    this.delivered.delete(agentId);
  }

  /** Returns pending. */
  getPending(agentId: string): ReadyAssignmentsInboxSignal | null {
    return this.pending.get(agentId) ?? null;
  }

  /** Returns delivered generation. */
  getDeliveredGeneration(agentId: string): number {
    return this.delivered.get(agentId) ?? 0;
  }

  /** Queue a signal for later delivery (when the agent stops streaming). */
  queue(agentId: string, signal: ReadyAssignmentsInboxSignal): void {
    this.pending.set(agentId, signal);
  }

  /**
   * Mark a signal as delivered. Removes any pending entry for the agent and
   * records the delivered generation so future stale signals are dropped.
   */
  markDelivered(agentId: string, generation: number): void {
    this.pending.delete(agentId);
    this.delivered.set(agentId, generation);
  }
}
