// Audit event type registry for workflow item events.

/** Audit event types emitted by work item priority and SLA flows. */
export const auditEventTypes = [
  'item.priority_changed',
  'item.sla_set',
  'item.sla_cleared',
  'item.sla_warning',
  'item.sla_breached',
] as const;

/** Audit event type. */
export type AuditEventType = (typeof auditEventTypes)[number];
