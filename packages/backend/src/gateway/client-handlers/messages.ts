import type { Handler } from '../protocol.js'
import * as messageStore from '../../storage/message-store.js'

export function registerMessageHandlers(h: (method: string, fn: Handler) => void): void {
  h('messages.get', async (params) => {
    const msg = messageStore.getMessage(params.id as string)
    if (!msg) throw new Error('not_found')
    return msg
  })
}
