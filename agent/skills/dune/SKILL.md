---
name: dune
description: Dune action reference — the complete list of host-side actions for managing projects, work items, tasks, assignments, agents, feedback, and work products. Use when you need a full payload schema or a concrete call example.
---

# Dune Action Reference

Dune exposes its host operations as **actions**. You invoke every action with the same two built-in MCP tools:

- **`search_actions({ query?, limit? })`** — search by keyword. Returns `{ name, description, inputSchema }` per match.
- **`call_action({ name, payload })`** — invoke an action by name. Returns the action's result as JSON.

All payload keys below are **optional** unless marked `(required)`. Actions default to the current project when `projectId` is omitted.

---

## Projects

### `workflow_projects_list`
List every Dune project.
- **Payload**: `{}`
- **Returns**: `{ projects: [{ id, name, description, rootPath, color, createdAt, updatedAt }] }`

### `workflow_projects_get`
Get one project. Defaults to the current project.
- **Payload**: `{ projectId? }`

### `workflow_projects_create`
Create a new project.
- **Payload**: `{ name (required), description?, rootPath? }` — `rootPath` is an absolute path on the host.

### `workflow_projects_update`
Update project fields. `rootPath` can only be set once — a project with a root path is frozen to that folder.
- **Payload**: `{ projectId?, name?, description?, rootPath? }`

### `workflow_projects_delete`
Delete a project and all of its agents. Destructive — prefer leaving projects in place.
- **Payload**: `{ projectId? }`

---

## Work items

### `workflow_items_list`
List work items in a project.
- **Payload**: `{ projectId? }`
- **Returns**: `{ items: [{ id, title, brief, status, tasks, workProducts, workflowEvents, primaryAgentId, ... }] }`

### `workflow_items_create`
Create a work item. New items default to the `inbox` lane.
- **Payload**: `{ title (required), brief?, note?, projectId?, status? }` — `status` is `"inbox"` or `"ready"`.
- **note**: optional workflow-history note recorded alongside the creation.

### `workflow_items_update`
Update fields on an item — title, brief, or the primary agent assignment.
- **Payload**: `{ itemId (required), title?, brief?, note?, primaryAgentId? }`
- **title / brief**: editable only while the item is in `inbox`.
- **note**: optional workflow-history note recorded alongside the update.
- **primaryAgentId**: agent ID to assign, or `null` to unassign. Changeable at any status except `done`. Use this for initial assignment, handoff mid-work, and reassignment to a reviewer when moving to `review`.

### `workflow_items_move`
Move an item between lanes. This is how work progresses.
- **Payload**: `{ itemId (required), status (required), index?, note? }`
- **status**: one of `"inbox" | "ready" | "active" | "review" | "acceptance" | "done"`. Agents may move approved `review` items to `"acceptance"` and may move items back out of `"acceptance"` when more work is needed, but only humans may move items to `"done"`.
- **index**: position within the destination lane. Default: end.
- **note**: optional workflow-history note recorded alongside the move.

### `workflow_items_add_feedback`
Attach feedback to an item — rejection reason, approval note, or general comment. Feedback becomes part of the item's workflow history.
- **Payload**: `{ itemId (required), feedback (required) }`

---

## Tasks (checklist entries inside a work item)

### `workflow_tasks_add`
Add a task.
- **Payload**: `{ itemId (required), title (required), note? }`
- **note**: optional workflow-history note recorded alongside the task addition.

### `workflow_tasks_update`
Update a task's title, notes, or status.
- **Payload**: `{ itemId (required), taskId (required), title?, notes?, status?, note? }`
- **status**: one of `"todo" | "doing" | "blocked" | "review" | "done"`.
- **note**: optional workflow-history note recorded alongside the task update.

---

## Work products (deliverables attached to an item)

### `workflow_work_products_add`
Attach a work product. Work products are the durable output trail — prefer them over chat messages for anything you want to survive.
- **Payload**: `{ itemId (required), title (required), body (required), note? }`
- **note**: optional workflow-history note recorded alongside the output.

---

## Agents

### `agents_list`
List agents in a project.
- **Payload**: `{ projectId? }`

### `agents_get`
Get one agent by ID.
- **Payload**: `{ agentId (required) }`

### `agents_create`
Create a new worker agent. Use this when the project grows past your current roster's skills. New agents start idle until they receive an assignment.
- **Payload**: `{ name (required), projectId?, channelId? }` — `channelId` defaults to `"dune-chat"`.

### `agents_delete`
Delete an agent. Clears any assignments it held.
- **Payload**: `{ agentId (required) }`

---

## Runtime

### `runtime_get_snapshot`
Get a sanitized snapshot of the live Dune runtime — all agents, coding engines, and runtime info for the current project. Read-only. Use when you need a bird's-eye view; prefer the targeted `workflow_*` actions for narrower queries.
- **Payload**: `{}`
