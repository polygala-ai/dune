# Review: Work item priority and SLA — deadlines with escalation alerts

**Date:** 2026-05-09
**Reviewer:** Codex (via Reviewer 1)
**Verdict:** NEEDS-WORK

## Summary
The PR adds priority/SLA fields, UI controls, SLA countdown badges, and a background monitor, but several requirements are only partially met. The main blocker is that late acceptance can bypass breach detection entirely, so breach notification and audit history are not reliable.

## Requirements Check
### Req 1: Priority field
**Status:** PASS

Priority is modeled as `critical | high | medium | low` in renderer types and shared helpers (`src/renderer/features/workflow/types.ts`, `src/shared/workflow/priority-sla.ts`), persisted in the workflow schema/migration, normalized for old snapshots, and defaulted to `medium` in item creation paths and seed/auto-created items.

### Req 2: SLA deadline field
**Status:** PARTIAL

The optional `slaDeadlineMs` field is added to workflow item types, persistence normalization, schema/migration, the UI inspector, and update handlers. However, the SLA semantics are incomplete: the deadline is defined as the time by which an item must reach acceptance, but `getSlaState()` treats any `acceptance` or `done` item as met even when `msLeft` is negative (`src/shared/workflow/priority-sla.ts:59-65`). The monitor also skips terminal items before checking breach state (`src/electron/main/sla/sla-monitor.ts:80`), so an item moved into acceptance after its deadline but before the monitor runs is recorded as met instead of breached.

### Req 3: Dune UI shows priority badge and countdown timer on each item card
**Status:** PARTIAL

The board renders SLA countdown/red/yellow state for items with `slaDeadlineMs` (`src/renderer/features/workflow/components/WorkflowBoard.tsx:127-146`). It does not show a priority badge on each item card: `showPriorityBadge` only renders badges for `critical`, `high`, or any item with an SLA (`src/renderer/features/workflow/components/WorkflowBoard.tsx:96-122`), so normal `medium` and `low` items without SLA display no priority badge.

### Req 4: SLA warning/breach colors and notification
**Status:** PARTIAL

The UI uses yellow styling for the warning window and red styling for breached items (`src/renderer/features/workflow/components/WorkflowBoard.tsx:132-138`), and the monitor sends native notifications for warnings and breaches (`src/electron/main/sla/sla-monitor.ts:90-110`, `src/electron/main.ts:106-119`). This is not reliable because the terminal-status skip described in Req 2 can suppress breach alerts for late acceptance. The notification countdown text is also inaccurate because warning hours are rounded up independently of minutes (`src/electron/main.ts:111-113`).

### Req 5: Items sorted by priority within each lane
**Status:** PARTIAL

The renderer board sorts column cards by priority (`src/renderer/features/workflow/components/WorkflowBoard.tsx:55-62`) and the renderer presenter sorts project items by priority (`src/renderer/features/workflow/model/workflow-presenters.ts:37-49`). The main-process `workflow.items.list` action still uses the old `compareItems()` comparator based on `sortOrder`/`updatedAt` (`src/electron/main/agent-actions/handlers/items.ts:60-64`, `src/electron/main/agent-actions/handlers/snapshot.ts:249-256`), so non-UI item lists are not priority-sorted. Also, `compareWorkflowPriority()` includes an `updatedAt` fallback, which prevents callers from using their intended `sortOrder` fallback for same-priority items (`src/shared/workflow/priority-sla.ts:33-42`).

### Req 6: SLA breach history report in audit log
**Status:** PARTIAL

Breaches are appended to item workflow events as `SLA breached.`, and project activity flattens workflow events into the activity/audit feed (`src/electron/main/sla/sla-monitor.ts:90-93`, `src/electron/main/workflow/workflow-coordinator.ts:176-190`). This is only an event, not a dedicated breach history report, and it inherits the late-acceptance gap from Req 2, meaning some breached SLAs may never be written to audit history.

## Code Quality Issues
### BLOCKER: Late acceptance can erase SLA breach handling
`getSlaState()` marks `acceptance`/`done` as met without considering whether the deadline already passed, and `createSlaMonitor()` skips terminal statuses before breach checks. This can miss breach notification and audit logging whenever an item reaches acceptance after the deadline but before the next 5-minute SLA sweep. The new hook test codifies this incorrect behavior by expecting a past-deadline `acceptance` item to be met (`tests/unit/src/renderer/features/workflow/hooks/use-sla-countdown.test.tsx:28-33`).

### NOTE: Agent action schema does not expose priority/SLA updates
The handler accepts `priority` and `slaDeadlineMs`, but the actual AgentLite action registration for `workflow.items.update` only exposes title, brief, note, and primary assignment (`src/electron/main/agent-actions/register-actions.ts:141-148`). Agents using `search_actions`/`call_action` will not discover or pass the new fields even though the handler supports them.

### NOTE: Priority badge coverage is incomplete
The board intentionally hides `medium` and `low` priority badges unless the item has an SLA. That conflicts with the requirement that each item card show the priority badge.

### NOTE: Sorting helper makes same-priority ordering surprising
`compareWorkflowPriority()` falls back to `updatedAt`, but callers then try to apply `sortOrder` afterward. Because the helper rarely returns `0`, the `sortOrder` fallback in `workflow-presenters.ts` is effectively bypassed for same-priority items.

### NOTE: Warning notification duration is formatted incorrectly
The native notification body uses `Math.ceil(msLeft / 3_600_000)` for hours plus a separate modulo minute value, so 90 minutes can display as `2h 30m remaining` instead of `1h 30m remaining`.

### NOTE: Unused shared type files were added
`src/shared/ipc-types.ts` and `src/shared/types.ts` appear unused. They add renderer-type re-export surface without participating in the implementation.

## Recommendation
Do not approve yet. Fix the SLA breach semantics first, then make the priority badge/reporting/action-schema behavior consistent across UI, agent actions, and audit activity.
