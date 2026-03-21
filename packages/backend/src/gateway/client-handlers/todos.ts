import type { Handler } from '../protocol.js'
import * as broadcast from '../broadcast.js'
import * as todoStore from '../../storage/todo-store.js'
import * as todoTimer from '../../domains/todos/todo-timer.js'
import { parseAndValidateDueAt } from '../../domains/todos/due-at.js'

export function registerTodoHandlers(h: (method: string, fn: Handler) => void): void {
  h('todos.list', async (params) => {
    const agentId = params.agentId as string
    if (!agentId) throw new Error('agentId required')
    return todoStore.listTodos(agentId, params.status as string | undefined)
  })

  h('todos.create', async (params) => {
    const { agentId, title, description, dueAt } = params as Record<string, unknown>
    if (!agentId || !title) throw new Error('agentId and title required')
    const parsedDueAt = parseAndValidateDueAt(dueAt)
    if (!parsedDueAt.ok) throw new Error(parsedDueAt.error!)
    const todo = todoStore.createTodo({ agentId: agentId as string, title: title as string, description: description as string | undefined, dueAt: parsedDueAt.value! })
    todoTimer.armTimer(todo.id, todo.dueAt)
    broadcast.sendToAll({ type: 'todo:change', payload: todo })
    return todo
  })

  h('todos.update', async (params) => {
    const { id, ...body } = params as Record<string, unknown>
    if (body.dueAt !== undefined) {
      const parsedDueAt = parseAndValidateDueAt(body.dueAt)
      if (!parsedDueAt.ok) throw new Error(parsedDueAt.error!)
      body.dueAt = parsedDueAt.value
    }
    const updated = todoStore.updateTodo(id as string, body)
    if (!updated) throw new Error('not_found')
    if (body.dueAt !== undefined || body.status !== undefined) {
      todoTimer.clearTimer(id as string)
      if (updated.status === 'pending' && updated.dueAt) todoTimer.armTimer(id as string, updated.dueAt)
    }
    broadcast.sendToAll({ type: 'todo:change', payload: updated })
    return updated
  })

  h('todos.delete', async (params) => {
    const id = params.id as string
    const deleted = todoStore.deleteTodo(id)
    if (!deleted) throw new Error('not_found')
    todoTimer.clearTimer(id)
    broadcast.sendToAll({ type: 'todo:delete', payload: { id, agentId: deleted.agentId } })
    return { ok: true }
  })
}
