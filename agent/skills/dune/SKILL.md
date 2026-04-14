---
name: dune
description: Dune project management — workflow tools for managing projects, work items, tasks, assignments, agents, feedback, and work products. Use when you need to interact with Dune's workflow system.
---

# Dune Workflow

You have access to Dune workflow tools via MCP (`mcp__dune__*`). These let you manage projects, work items, tasks, assignments, and agents.

## Available tools

### Projects
- `mcp__dune__workflow_projects_list` — list all projects
- `mcp__dune__workflow_projects_get` — get a project (defaults to current)
- `mcp__dune__workflow_projects_create` — create a project
- `mcp__dune__workflow_projects_update` — update project details
- `mcp__dune__workflow_projects_delete` — delete a project and its agents

### Work Items
- `mcp__dune__workflow_items_list` — list items in a project
- `mcp__dune__workflow_items_create` — create an item with title and brief
- `mcp__dune__workflow_items_update` — update item title or brief
- `mcp__dune__workflow_items_move` — move item between lanes (see review flow below)
- `mcp__dune__workflow_items_add_feedback` — add feedback to an item (approve, reject, or comment)

### Tasks (checklists on items)
- `mcp__dune__workflow_tasks_add` — add a task to an item
- `mcp__dune__workflow_tasks_update` — update task title, notes, or status (todo/doing/blocked/review/done)

### Work Products (deliverables)
- `mcp__dune__workflow_work_products_add` — attach a work product to an item

### Assignments
- `mcp__dune__workflow_assignments_set_primary_agent` — assign an agent to an item
- `mcp__dune__workflow_assignments_clear_primary_agent` — unassign

### Agents
- `mcp__dune__agents_list` — list agents in a project
- `mcp__dune__agents_get` — get agent details
- `mcp__dune__agents_create` — create a new agent
- `mcp__dune__agents_delete` — delete an agent
- `mcp__dune__agents_ensure_project_main` — ensure a project-main coordinator exists

### Runtime
- `mcp__dune__runtime_get_snapshot` — get the full runtime state

## Item lifecycle

```
inbox → ready → active → review → done
                           ↑          ↑
                     agent review   human only
```

- **inbox → ready**: Project-main triages, refines brief, moves to ready
- **ready → active**: Assigned worker claims the item
- **active → review**: Worker finishes, moves to review
- **review**: Reviewer agent checks quality
  - **reject**: add feedback, move back to active
  - **approve**: add feedback "Agent review: approved", leave in review for human
- **review → done**: Human only (final approval gate)

## Review flow

When an item reaches review:
1. Reviewer checks: all tasks done? Work product present? Addresses the brief?
2. If not: `add_feedback("Rejected: {reason}")` then `items_move(status: "active")`
3. If yes: `add_feedback("Agent review: approved — {summary}")`
4. Human sees agent-approved items and makes final decision

## Rules

- Read before write — inspect state before mutating.
- Trust returned data as source of truth after mutations.
- Never invent IDs — get them from tool results.
- Only humans can move items to done.
- Agents can move review → active (rejection with feedback).
- Most tools default to the current project when `projectId` is omitted.
