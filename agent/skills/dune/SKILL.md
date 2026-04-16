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
- **Payload**: `{ title (required), brief?, projectId?, status? }` — `status` is `"inbox"` or `"ready"`.

### `workflow_items_update`
Change the title or brief of an existing item.
- **Payload**: `{ itemId (required), title?, brief? }`

### `workflow_items_move`
Move an item between lanes. This is how work progresses.
- **Payload**: `{ itemId (required), status (required), index? }`
- **status**: one of `"inbox" | "ready" | "active" | "review" | "done"`. Agents **must not** set `"done"` — that lane is human-only.
- **index**: position within the destination lane. Default: end.

### `workflow_items_add_feedback`
Attach feedback to an item — rejection reason, approval note, or general comment. Feedback becomes part of the item's workflow history.
- **Payload**: `{ itemId (required), feedback (required) }`

---

## Tasks (checklist entries inside a work item)

### `workflow_tasks_add`
Add a task.
- **Payload**: `{ itemId (required), title (required) }`

### `workflow_tasks_update`
Update a task's title, notes, or status.
- **Payload**: `{ itemId (required), taskId (required), title?, notes?, status? }`
- **status**: one of `"todo" | "doing" | "blocked" | "review" | "done"`.

---

## Work products (deliverables attached to an item)

### `workflow_work_products_add`
Attach a work product. Work products are the durable output trail — prefer them over chat messages for anything you want to survive.
- **Payload**: `{ itemId (required), title (required), body (required) }`

---

## Assignments

### `workflow_assignments_set_primary_agent`
Assign a primary agent to a work item.
- **Payload**: `{ itemId (required), agentId (required) }`

### `workflow_assignments_clear_primary_agent`
Unassign.
- **Payload**: `{ itemId (required) }`

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

### `agents_ensure_project_main`
Guarantee that a project has a `project-main` coordinator. If one already exists, no-op.
- **Payload**: `{ projectId?, projectName? }`

---

## Runtime

### `runtime_get_snapshot`
Get a sanitized snapshot of the live Dune runtime — all agents, coding engines, and runtime info for the current project. Read-only. Use when you need a bird's-eye view; prefer the targeted `workflow_*` actions for narrower queries.
- **Payload**: `{}`

---

## ACP coding agents (conditional — only present when available)

### `acp_list_remote_agents`
List the available ACP peers.
- **Payload**: `{}`
- **Returns**: `{ agents: [{ name, description, agent_info? }] }`

### `acp_new_session`
Create a fresh ACP session with one peer.
- **Payload**: `{ peer (required), cwd? }`
- **Returns**: `{ session_id }`

### `acp_prompt`
Send a background ACP prompt. For plain text work, use `prompt: [{ type: "text", text: "..." }]`.
- **Payload**: `{ session_id (required), prompt (required) }`
- **Returns**: `{ ok: true }`

### `acp_cancel`
Cancel the active background ACP prompt for a session.
- **Payload**: `{ session_id (required) }`

### `acp_close_session`
Close the ACP session when done.
- **Payload**: `{ session_id (required) }`

### Async workflow

1. Call `acp_list_remote_agents` if you do not know the peer names yet.
2. Create a session with `acp_new_session`.
3. For project work, use the **Project host path** from your `CLAUDE.md` as `cwd`; ACP peers cannot use `/workspace/extra/project/`.
4. Send the task with `acp_prompt`, then keep doing other work.
5. Wait for the ACP completion notice in chat. It includes a result artifact path under `/workspace/extra/dune/...`.
6. Read or grep that artifact only if you need details, then `acp_close_session`.

---

## Work item lifecycle

```
inbox  →  ready  →  active  →  review  →  done
                                 ↑            ↑
                           agent review    human only
```

- **inbox**: unsorted, unreviewed. Project-main triages here.
- **ready**: brief is clear, item is assignable.
- **active**: a worker owns it and is executing.
- **review**: worker thinks it's finished; reviewer (usually project-main) checks quality.
- **done**: human-approved. **Only humans move items to `done`.**

### Review flow

1. Reviewer reads brief, tasks, and all work products on the item.
2. Reviewer checks: all tasks `done`? At least one work product? Does it address the brief?
3. If not: `workflow_items_add_feedback` with a specific rejection reason, then `workflow_items_move` back to `active`. Rejection feedback must be actionable — the worker should be able to fix the issue without asking you to re-explain.
4. If yes: `workflow_items_add_feedback` with `"Agent review: approved — {one-sentence summary}"`. Leave in `review` for the human to make the final call.

---

## Core rules

- **Read before write.** Inspect current state before mutating it.
- **Trust returned results.** After a mutation, the returned payload is the new source of truth.
- **Never invent IDs.** Every ID you pass must come from a previous action result.
- **Coordinate through work items**, not direct agent messages.
- **Don't touch raw Dune storage** — always go through actions.
- **Only humans move items to `done`.** Agents can move `review → active` (rejection), but never `review → done`.
- **If an action is denied, stop and explain.** Don't retry with different arguments hoping to slip past.
