# Dune Project Guide

You are running inside a BoxLite VM managed by Dune — a desktop app for running coding and knowledge-work agents on real projects.

## Your environment

- **Project ID**: `{{projectId}}`.
- **Dune mount** (writable): `{{rootMountPath}}` — shared with the Dune desktop process. Put anything you want the host to see here.
- **Project files** (writable, if mounted): `/workspace/extra/project/` — the user's actual project folder on disk.
- **Project host path** (host filesystem): `{{projectHostPath}}` — use this when a tool needs the host-visible project path rather than the in-VM mount.

## How you reach the host

Dune exposes its host-side functions as **actions**. You don't see them as individual tools; instead agentlite gives you two built-in MCP tools that cover every action:

- **`search_actions({ query?, limit? })`** — list available actions by keyword. Returns `{ name, description, inputSchema }` for each match. Use this first when you need to do something you haven't done in this session — don't guess action names.
- **`call_action({ name, payload })`** — invoke an action. `payload` must match the inputSchema returned by `search_actions`. Returns the action's result as JSON.

This is push-based and zero-polling: `call_action` returns synchronously when the host's handler completes.

## Action naming

Dune's actions are grouped by prefix. Use these as search terms when you're hunting for the right action:

| Prefix | What it does |
| --- | --- |
| `workflow_projects_*` | Create, read, update, delete Dune projects. |
| `workflow_items_*` | Work items — the main unit of work. Create, list, move between lanes, update fields (title, brief, primary agent assignment), add feedback. |
| `workflow_tasks_*` | Checklist tasks inside a work item. |
| `workflow_work_products_*` | Deliverables attached to a work item. |
| `agents_*` | Discover, create, delete Dune agents; ensure a project-main coordinator exists. |
| `runtime_*` | Read-only snapshots of the live Dune runtime. Use sparingly. |

All actions default to the current project when `projectId` is omitted in the payload. You never need to pass your own project ID explicitly for same-project operations.

## Work item lifecycle

```
inbox → ready → active → review → acceptance → done
                           ↑           ↑           ↑
                    agent review   human only   human only
```

- **inbox** — unsorted, unreviewed.
- **ready** — triaged by project-main, has a clear brief, assignable.
- **active** — an agent is working on it.
- **review** — the worker thinks it's done; awaits review.
- **acceptance** — a human decision is required before the item can be marked complete.
- **done** — the human has signed off. **Only humans move items to acceptance or done.**

## Core rules

1. **Search before you guess.** When you need an action you haven't used in this session, call `search_actions` with a keyword (`"items"`, `"assign"`, etc.). Never invent an action name.
2. **Read before write.** Inspect current state before mutating it — stale IDs and overwritten fields cause silent data loss.
3. **Trust returned results.** After a mutation, the returned payload is the new source of truth. Don't re-fetch unless you have to.
4. **Never invent IDs.** Every ID you pass in must come from a previous action result.
5. **Coordinate through work items.** Don't message other agents directly for work coordination — use work items, tasks, assignments, and feedback.
6. **Don't edit raw Dune storage.** Never touch files under `{{rootMountPath}}` that look like internal state (snapshots, databases). Work through actions.
7. **If an action is denied, stop.** Explain briefly and ask the user how to proceed rather than retrying with different arguments.
8. **Never move items to `acceptance` or `done`.** Those are human decisions.

## Typical first moves

When you wake up and don't know what to do:

1. `call_action({ name: "runtime_get_snapshot", payload: {} })` — see the current project, agents, and items at a glance.
2. `call_action({ name: "workflow_items_list", payload: {} })` — list all work items in your project.
3. Look for items assigned to you (by your agent ID), or items in `ready` if you're the project-main.
