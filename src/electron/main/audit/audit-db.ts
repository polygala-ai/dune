import Database from 'better-sqlite3';
import path from 'node:path';

export type AuditEventType =
  | 'item.created' | 'item.moved' | 'item.deleted' | 'item.updated'
  | 'agent.assigned'
  | 'feedback.added'
  | 'work_product.added' | 'work_product.deleted'
  | 'task.created' | 'task.updated' | 'task.deleted';

export interface AuditEventRow {
  id: number;
  ts: number;
  actor: string;
  actor_type: 'agent' | 'user' | 'system';
  event_type: AuditEventType;
  item_id: string | null;
  item_title: string | null;
  project_id: string;
  summary: string;
  details: string | null;
}

export interface RecordEventParams {
  ts?: number;
  actor: string;
  actorType: 'agent' | 'user' | 'system';
  eventType: AuditEventType;
  itemId?: string | null;
  itemTitle?: string | null;
  projectId: string;
  summary: string;
  details?: Record<string, unknown> | null;
}

export interface QueryAuditParams {
  projectId: string;
  since?: number;
  until?: number;
  eventType?: string;
  actor?: string;
  itemId?: string;
  limit?: number;
  offset?: number;
}

export class AuditDatabase {
  private db: InstanceType<typeof Database>;
  private insertStmt: ReturnType<InstanceType<typeof Database>['prepare']>;

  constructor(userDataDir: string) {
    this.db = new Database(path.join(userDataDir, 'audit.db'));
    this.db.pragma('journal_mode = WAL');
    this.db.exec(`
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
      CREATE INDEX IF NOT EXISTS idx_audit_ts         ON audit_events(ts);
      CREATE INDEX IF NOT EXISTS idx_audit_event_type ON audit_events(event_type);
      CREATE INDEX IF NOT EXISTS idx_audit_actor      ON audit_events(actor);
      CREATE INDEX IF NOT EXISTS idx_audit_item_id    ON audit_events(item_id);
      CREATE INDEX IF NOT EXISTS idx_audit_project_id ON audit_events(project_id);
    `);
    this.insertStmt = this.db.prepare(`
      INSERT INTO audit_events
        (ts, actor, actor_type, event_type, item_id, item_title, project_id, summary, details)
      VALUES
        (@ts, @actor, @actorType, @eventType, @itemId, @itemTitle, @projectId, @summary, @details)
    `);
  }

  record(params: RecordEventParams): void {
    this.insertStmt.run({
      ts: params.ts ?? Date.now(),
      actor: params.actor,
      actorType: params.actorType,
      eventType: params.eventType,
      itemId: params.itemId ?? null,
      itemTitle: params.itemTitle ?? null,
      projectId: params.projectId,
      summary: params.summary,
      details: params.details ? JSON.stringify(params.details) : null,
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

    const rows = this.db.prepare(
      `SELECT * FROM audit_events WHERE ${where} ORDER BY ts DESC LIMIT @limit OFFSET @offset`,
    ).all({ ...bindings, limit, offset }) as AuditEventRow[];

    const { count } = this.db.prepare(
      `SELECT COUNT(*) as count FROM audit_events WHERE ${where}`,
    ).get(bindings) as { count: number };

    return { rows, total: count };
  }

  exportCsv(params: Omit<QueryAuditParams, 'limit' | 'offset'>): string {
    const { rows } = this.query({ ...params, limit: 10_000, offset: 0 });
    const headers = ['id', 'timestamp', 'actor', 'actor_type', 'event_type', 'item_id', 'item_title', 'project_id', 'summary', 'details'];
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    return [
      headers.join(','),
      ...rows.map((r) => [
        r.id,
        new Date(r.ts).toISOString(),
        esc(r.actor),
        esc(r.actor_type),
        esc(r.event_type),
        esc(r.item_id),
        esc(r.item_title),
        esc(r.project_id),
        esc(r.summary),
        esc(r.details),
      ].join(',')),
    ].join('\n');
  }

  close(): void {
    this.db.close();
  }
}
