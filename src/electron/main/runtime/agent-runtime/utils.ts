export function isAgentLiteRuntimeLockError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);

  return message.includes('Failed to acquire runtime lock')
    || message.includes('Another BoxliteRuntime is already using directory');
}

export function waitForTimeout(delayMs: number): Promise<void> {
  return new Promise<void>((resolve) => {
    globalThis.setTimeout(resolve, delayMs);
  });
}

export function createGroupFolder(name: string, agentId: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'agent';

  return `${slug}-${agentId.split(':').pop()?.slice(0, 8) ?? 'agent'}`;
}
