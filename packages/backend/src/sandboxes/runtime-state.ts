import type { ActiveSandboxRuntime } from './types.js'
import { createBoxliteRuntime } from '../boxlite/runtime.js'

export const activeBySandboxId = new Map<string, ActiveSandboxRuntime>()
export const sandboxLocks = new Map<string, Promise<void>>()

let runtime: any = null

export function getRuntime() {
  if (!runtime) {
    runtime = createBoxliteRuntime()
  }
  return runtime
}

export function closeSandboxRuntime() {
  if (runtime) {
    runtime.close()
    runtime = null
  }
}

export async function withSandboxLock<T>(sandboxId: string, work: () => Promise<T>): Promise<T> {
  const previous = sandboxLocks.get(sandboxId) || Promise.resolve()
  let release!: () => void
  const gate = new Promise<void>((resolveGate) => {
    release = resolveGate
  })
  const chain = previous.then(() => gate)
  sandboxLocks.set(sandboxId, chain)
  await previous
  try {
    return await work()
  } finally {
    release()
    if (sandboxLocks.get(sandboxId) === chain) {
      sandboxLocks.delete(sandboxId)
    }
  }
}
