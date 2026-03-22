import type { ActiveSandboxRuntime } from './types.js'
import { createBoxliteRuntime } from '../../boxlite/runtime.js'
import { withKeyedLock } from '../../utils/async-lock.js'

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
  return withKeyedLock(sandboxLocks, sandboxId, work)
}
