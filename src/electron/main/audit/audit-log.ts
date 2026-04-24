import Database from 'better-sqlite3';

import type {
  AuditEvent,
  AuditEventRow,
  QueryAuditParams,
} from '@/shared/audit-log';

export type {
  AuditEvent,
  AuditEventRow,
  QueryAuditParams,
} from '@/shared/audit-log';

/** Ensures the audit_events SQLite table exists in the app database. */
export function ensureAuditEventsSchema(db: InstanceType<typeof Database>): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS audit_events (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      ts           INTEGER NOT NULL,
      actor        TEXT    NOT NULL,
      actor_type   TEXT    NOT NULL,
      event_type   TEXT    NOT NULL,
      item_id      TEXT,
      item_title   TEXT,
      project_id   TEXT    NOT NULL,
      summary      TEXT    NOT NULL,
      details      TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_audit_events_ts         ON audit_events(ts);
    CREATE INDEX IF NOT EXISTS idx_audit_events_event_type ON audit_events(event_type);
    CREATE INDEX IF NOT EXISTS idx_audit_events_actor      ON audit_events(actor);
    CREATE INDEX IF NOT EXISTS idx_audit_events_item_id    ON audit_events(item_id);
    CREATE INDEX IF NOT EXISTS idx_audit_events_project_id ON audit_events(project_id);
  `);
}

/** Persistent audit log backed by SQLite. */
export class AuditLog {
  constructor(private db: InstanceType<typeof Database>) {
    ensureAuditEventsSchema(db);
  }

  record(event: AuditEvent): void {
    this.db.prepare(`
      INSERT INTO audit_events
        (ts, actor, actor_type, event_type, item_id, item_title, project_id, summary, details)
      VALUES
        (@ts, @actor, @actorType, @eventType, @itemId, @itemTitle, @projectId, @summary, @details)
    `).run({
      ts: event.ts ?? Date.now(),
      actor: event.actor,
      actorType: event.actorType,
      eventType: event.eventType,
      itemId: event.itemId ?? null,
      itemTitle: event.itemTitle ?? null,
      projectId: event.projectId,
      summary: event.summary,
      details: event.details ? JSON.stringify(event.details) : null,
    });
  }

  query(params: QueryAuditParams): { rows: AuditEventRow[]; total: number } {
    const conditions: string[] = ['project_id = @projectId'];
    const bindings: Record<string, unknown> = { projectId: params.projectId };

    if (params.since) {
      conditions.push('ts >= @since');
      bindings.since = params.since;
    }

    if (params.until) {
      conditions.push('ts <= @until');
      bindings.until = params.until;
    }

    if (params.eventType) {
      conditions.push('event_type = @eventType');
      bindings.eventType = params.eventType;
    }

    if (params.actor) {
      conditions.push('actor = @actor');
      bindings.actor = params.actor;
    }

    if (params.itemId) {
      conditions.push('item_id = @itemId');
      bindings.itemId = params.itemId;
    }

    const where = conditions.join(' AND ');
    const limit = Math.min(params.limit ?? 100, 500);
    const offset = params.offset ?? 0;

    const total = (this.db.prepare(
      `SELECT COUNT(*) as c FROM audit_events WHERE ${where}`,
    ).get(bindings) as { c: number }).c;
    const rows = this.db.prepare(`
      SELECT * FROM audit_events
      WHERE ${where}
      ORDER BY ts DESC
      LIMIT @limit OFFSET @offset
    `).all({ ...bindings, limit, offset }) as AuditEventRow[];

    return { rows, total };
  }

  exportCsv(params: QueryAuditParams): string {
    const { rows } = this.query({ ...params, limit: 10_000, offset: 0 });
    return rowsToCsv(rows);
  }
}

export function rowsToCsv(rows: AuditEventRow[]): string {
  const headers = [
    'id',
    'timestamp',
    'actor',
    'actor_type',
    'event_type',
    'item_id',
    'item_title',
    'project_id',
    'summary',
    'details',
  ];
  const escape = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;

  return [
    headers.join(','),
    ...rows.map((row) => [
      row.id,
      new Date(row.ts).toISOString(),
      escape(row.actor),
      escape(row.actor_type),
      escape(row.event_type),
      escape(row.item_id),
      escape(row.item_title),
      escape(row.project_id),
      escape(row.summary),
      escape(row.details),
    ].join(',')),
  ].join('\n');
}
