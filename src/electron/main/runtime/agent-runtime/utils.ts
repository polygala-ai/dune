// Agent runtime utility helpers.

import { sanitizeSlug } from '@/shared/sanitize';

/** Returns whether the error is an agent lite runtime lock error. */
export function isAgentLiteRuntimeLockError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);

  return message.includes('Failed to acquire runtime lock')
    || message.includes('Another BoxliteRuntime is already using directory');
}

/** Waits for for timeout. */
export function waitForTimeout(delayMs: number): Promise<void> {
  return new Promise<void>((resolve) => {
    globalThis.setTimeout(resolve, delayMs);
  });
}

/** Creates group folder. */
export function createGroupFolder(name: string, agentId: string): string {
  const slug = sanitizeSlug(name, 'agent');

  return `${slug}-${agentId.split(':').pop()?.slice(0, 8) ?? 'agent'}`;
}
