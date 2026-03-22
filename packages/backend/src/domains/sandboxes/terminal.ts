import { assertReadPermission, ensureBoxRunning } from './acl.js'
import { resolveBox } from './resource.js'
import { ensureRuntimeBox } from './exec-helpers.js'
import type { ActorIdentity } from './types.js'

export async function getTerminalBox(identity: ActorIdentity, boxId: string): Promise<any> {
  const box = await resolveBox(identity, boxId)
  if (!box) throw new Error('not_found')
  assertReadPermission(identity, boxId)
  ensureBoxRunning(identity, box)
  const runtimeEntry = await ensureRuntimeBox(identity, boxId)
  const nativeBox = await runtimeEntry.box['_ensureBox']()
  return nativeBox
}
