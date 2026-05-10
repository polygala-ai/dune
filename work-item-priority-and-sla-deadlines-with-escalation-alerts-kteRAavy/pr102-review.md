# PR #102 Review — Priority and SLA Deadlines

## VERDICT: NEEDS-WORK

## Summary
The PR adds the expected priority/SLA data model, editing surfaces, countdown UI, monitor notifications, priority sorting, and unit tests. However, the SLA state model treats every item in acceptance/done as met even when the deadline is already past, so late acceptance can suppress breach alerts and audit history.

## Requirements Check
### Req 1: Priority field
Mostly satisfied. Priority is modeled as `critical | high | medium | low`, defaults to `medium` for new items and legacy snapshots, and is exposed through the inspector and item update tool (`src/electron/main/db/migrations/006_priority_sla.sql:1`, `src/electron/main/agent-actions/handlers/items.ts:107`, `src/renderer/app/hooks/use-workflow-persistence.ts:227`).

Gap: the create tool still cannot set initial priority at creation time, only update it after creation. That may be acceptable for the brief, but it is less ergonomic for agents.

### Req 2: SLA deadline field
Mostly satisfied. `slaDeadlineMs` is optional, persisted, editable in the inspector with `datetime-local`, and accepted/cleared through the item update tool (`src/electron/main/db/migrations/006_priority_sla.sql:4`, `src/electron/main/agent-actions/handlers/items.ts:145`, `src/renderer/features/workflow/components/WorkflowItemInspector.tsx:409`).

Blocking semantic issue: the implementation does not track when the item reached acceptance, so it cannot distinguish on-time acceptance from late acceptance.

### Req 3: UI badges and countdown
Partially satisfied. SLA countdown/warning/breach state appears on cards with an SLA (`src/renderer/features/workflow/components/WorkflowBoard.tsx:127`).

Gap: priority badges are not shown on each item card. The board only shows the badge for `critical`, `high`, or items that happen to have an SLA, so ordinary `medium` and `low` cards hide their priority (`src/renderer/features/workflow/components/WorkflowBoard.tsx:97`).

### Req 4: Warning/breach states and notifications
Partially satisfied. The countdown turns yellow inside the 2-hour window and red after breach, and the main process sends Electron notifications for warning/breach (`src/renderer/features/workflow/components/WorkflowBoard.tsx:132`, `src/electron/main/sla/sla-monitor.ts:90`, `src/electron/main.ts:111`).

Blocker: late acceptance can be marked as met instead of breached, which suppresses the red alert and notification path.

### Req 5: Lane sorting by priority
Satisfied for the primary requirement. Each lane filters items by status and sorts by the priority comparator (`src/renderer/features/workflow/components/WorkflowBoard.tsx:55`, `src/shared/workflow/priority-sla.ts:33`).

Quality issue: equal-priority board order falls back to `updatedAt`, not `sortOrder`, so manual drag order within the same priority can be unstable or ignored after updates.

### Req 6: Audit log / breach history
Partially satisfied. The monitor prepends `SLA breached.` and warning entries to item workflow events, which feed the activity/audit views (`src/electron/main/sla/sla-monitor.ts:90`).

Gap: there is no dedicated breach history report beyond activity entries. More importantly, the blocker below means late acceptance can avoid creating any breach audit event.

## BLOCKER: Late acceptance after the deadline is incorrectly treated as SLA met
`getSlaState` returns `isMet: true` for `acceptance` or `done` before checking whether `slaDeadlineMs - now` is negative (`src/shared/workflow/priority-sla.ts:57`). The monitor also skips all terminal items before evaluating breach state (`src/electron/main/sla/sla-monitor.ts:80`). The new hook test codifies this by asserting that an overdue item in `acceptance` is met (`tests/unit/src/renderer/features/workflow/hooks/use-sla-countdown.test.tsx:28`).

Because the SLA is defined as "by which item must reach acceptance", an item moved to acceptance after the deadline should breach, notify, and record audit history. This needs either an accepted-at timestamp/status-transition event check or breach evaluation during the move into acceptance.

## NOTE: Medium and low priority badges are hidden on normal cards
The card only renders the priority badge when the item is critical/high or has an SLA (`src/renderer/features/workflow/components/WorkflowBoard.tsx:97`). The brief says the Dune UI should show a priority badge on each item card, so the badge should render for all priorities.

## NOTE: SLA warning notification time is formatted incorrectly
The notification body uses `Math.ceil(msLeft / 3_600_000)` for hours and also includes remaining minutes (`src/electron/main.ts:111`). For 61 minutes remaining this can display `2h 1m remaining`, which overstates the deadline.

## Code Quality
`pnpm run typecheck` passes. Focused changed tests pass: 9 tests across SLA monitor/hook/board/item update, plus 56 tests across remaining changed unit files. `git diff --check origin/main...HEAD` passes.

Test coverage is useful for the happy paths, but it misses the late-acceptance breach case and the requirement that every card shows a priority badge. `pnpm run lint` fails across the existing repo baseline; the PR also adds at least one new lint issue in `src/electron/main/sla/sla-monitor.ts` for unsafe spreading of an `unknown` array.
