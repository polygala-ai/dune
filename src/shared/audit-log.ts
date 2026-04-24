export const auditEventTypes = [
  'item.created',
  'item.moved',
  'item.deleted',
  'item.updated',
  'agent.assigned',
  'feedback.added',
  'work_product.added',
  'work_product.deleted',
  'task.created',
  'task.updated',
  'task.deleted',
] as const;

export type AuditEventType = (typeof auditEventTypes)[number];
export type AuditActorType = 'agent' | 'user' | 'system';

export interface AuditEvent {
  ts?: number;
  actor: string;
  actorType: AuditActorType;
  eventType: AuditEventType;
  itemId?: string | null;
  itemTitle?: string | null;
  projectId: string;
  summary: string;
  details?: Record<string, unknown> | null;
}

export interface AuditEventRow {
  id: number;
  ts: number;
  actor: string;
  actor_type: AuditActorType;
  event_type: AuditEventType;
  item_id: string | null;
  item_title: string | null;
  project_id: string;
  summary: string;
  details: string | null;
}

export interface QueryAuditParams {
  projectId: string;
  since?: number;
  until?: number;
  eventType?: AuditEventType | string;
  actor?: string;
  itemId?: string;
  limit?: number;
  offset?: number;
}
