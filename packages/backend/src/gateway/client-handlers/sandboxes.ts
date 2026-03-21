import type { Handler, CallContext } from '../protocol.js'
import * as sandboxManager from '../../sandboxes/sandbox-manager.js'

function sandboxActor(ctx: CallContext) {
  return { actorType: ctx.actor.actorType, actorId: ctx.actor.actorId }
}

export function registerSandboxHandlers(h: (method: string, fn: Handler) => void): void {
  h('sandboxes.listBoxes', async (_params, ctx) => {
    return sandboxManager.listBoxes(sandboxActor(ctx))
  })

  h('sandboxes.createBox', async (params, ctx) => {
    return sandboxManager.createBox(sandboxActor(ctx), params as any)
  })

  h('sandboxes.getBox', async (params, ctx) => {
    const box = await sandboxManager.getBox(sandboxActor(ctx), params.boxId as string)
    if (!box) throw new Error('not_found')
    return box
  })

  h('sandboxes.patchBox', async (params, ctx) => {
    const { boxId, ...body } = params as Record<string, unknown>
    const box = await sandboxManager.patchBox(sandboxActor(ctx), boxId as string, body as any)
    if (!box) throw new Error('not_found')
    return box
  })

  h('sandboxes.deleteBox', async (params, ctx) => {
    const ok = await sandboxManager.deleteBox(sandboxActor(ctx), params.boxId as string, !!params.force)
    if (!ok) throw new Error('not_found')
  })

  h('sandboxes.startBox', async (params, ctx) => {
    const box = await sandboxManager.startBox(sandboxActor(ctx), params.boxId as string)
    if (!box) throw new Error('not_found')
    return box
  })

  h('sandboxes.stopBox', async (params, ctx) => {
    return sandboxManager.stopBox(sandboxActor(ctx), params.boxId as string)
  })

  h('sandboxes.getBoxStatus', async (params, ctx) => {
    const status = await sandboxManager.getBoxStatus(sandboxActor(ctx), params.boxId as string)
    if (!status) throw new Error('not_found')
    return status
  })

  h('sandboxes.createExec', async (params, ctx) => {
    const { boxId, command, args, env, timeoutSeconds, workingDir, tty, ...rest } = params as Record<string, unknown>
    const created = await sandboxManager.createExec(sandboxActor(ctx), boxId as string, {
      command: String(command || ''),
      args: Array.isArray(args) ? args.map((item: unknown) => String(item)) : [],
      env: typeof env === 'object' && env ? env as Record<string, string> : {},
      timeoutSeconds: typeof timeoutSeconds === 'number' ? timeoutSeconds : undefined,
      workingDir: typeof workingDir === 'string' ? workingDir : undefined,
      tty: !!tty,
    })
    if (!created) throw new Error('not_found')
    return created
  })

  h('sandboxes.listExecs', async (params, ctx) => {
    const result = await sandboxManager.listExecs(sandboxActor(ctx), params.boxId as string)
    if (!result) throw new Error('not_found')
    return result
  })

  h('sandboxes.getExec', async (params, ctx) => {
    const result = await sandboxManager.getExec(sandboxActor(ctx), params.boxId as string, params.execId as string)
    if (!result) throw new Error('not_found')
    return result
  })

  h('sandboxes.getExecEvents', async (params, ctx) => {
    const afterSeq = Number(params.afterSeq || 0)
    const limit = Number(params.limit || 500)
    const events = await sandboxManager.getExecEvents(sandboxActor(ctx), params.boxId as string, params.execId as string, afterSeq, limit)
    if (!events) throw new Error('not_found')
    return events
  })

  h('sandboxes.uploadFiles', async (params, ctx) => {
    await sandboxManager.uploadFileContent(
      sandboxActor(ctx),
      params.boxId as string,
      String(params.path || ''),
      String(params.contentBase64 || ''),
      params.overwrite === undefined ? true : !!params.overwrite,
    )
  })

  h('sandboxes.downloadFile', async (params, ctx) => {
    const file = await sandboxManager.downloadFileContent(sandboxActor(ctx), params.boxId as string, params.path as string)
    if (!file) throw new Error('not_found')
    return file
  })

  h('sandboxes.importHostPath', async (params, ctx) => {
    const { boxId, ...body } = params as Record<string, unknown>
    await sandboxManager.importHostPath(sandboxActor(ctx), boxId as string, body as any)
  })

  h('sandboxes.listFs', async (params, ctx) => {
    const path = params.path as string
    if (!path) throw new Error('path required')
    const result = await sandboxManager.listFsEntries(sandboxActor(ctx), params.boxId as string, path, {
      includeHidden: !!params.includeHidden,
      limit: Number(params.limit || 1000),
    })
    if (!result) throw new Error('not_found')
    return result
  })

  h('sandboxes.readFs', async (params, ctx) => {
    const path = params.path as string
    if (!path) throw new Error('path required')
    const result = await sandboxManager.readFsFileContent(sandboxActor(ctx), params.boxId as string, path, Number(params.maxBytes || 1024 * 1024))
    if (!result) throw new Error('not_found')
    return result
  })

  h('sandboxes.mkdirFs', async (params, ctx) => {
    await sandboxManager.mkdirFsPath(sandboxActor(ctx), params.boxId as string, {
      path: String(params.path || ''),
      recursive: params.recursive === undefined ? true : !!params.recursive,
    })
  })

  h('sandboxes.moveFs', async (params, ctx) => {
    await sandboxManager.moveFsPath(sandboxActor(ctx), params.boxId as string, {
      fromPath: String(params.fromPath || ''),
      toPath: String(params.toPath || ''),
      overwrite: !!params.overwrite,
    })
  })

  h('sandboxes.deleteFs', async (params, ctx) => {
    const path = params.path as string
    if (!path) throw new Error('path required')
    await sandboxManager.deleteFsPath(sandboxActor(ctx), params.boxId as string, path, !!params.recursive)
  })
}
