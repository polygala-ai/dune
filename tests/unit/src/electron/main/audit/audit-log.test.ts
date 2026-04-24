import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest';
import Database from 'better-sqlite3';

import {
  AuditLog,
  rowsToCsv,
} from '@/electron/main/audit/audit-log';

describe('AuditLog', () => {
  let sqlite: InstanceType<typeof Database>;
  let auditLog: AuditLog;

  beforeEach(() => {
    sqlite = new Database(':memory:');
    auditLog = new AuditLog(sqlite);
  });

  afterEach(() => {
    sqlite.close();
  });

  it('records and retrieves an event', () => {
    auditLog.record({
      actor: 'test-agent',
      actorType: 'agent',
      eventType: 'item.created',
      projectId: 'proj-1',
      itemId: 'item-1',
      itemTitle: 'Test Item',
      summary: 'Item created',
    });
    const { rows, total } = auditLog.query({ projectId: 'proj-1' });
    expect(total).toBe(1);
    expect(rows[0]?.actor).toBe('test-agent');
    expect(rows[0]?.event_type).toBe('item.created');
  });

  it('filters by event_type', () => {
    auditLog.record({ actor: 'a', actorType: 'agent', eventType: 'item.created', projectId: 'p', summary: 's1' });
    auditLog.record({ actor: 'a', actorType: 'agent', eventType: 'item.moved', projectId: 'p', summary: 's2' });
    const { rows } = auditLog.query({ projectId: 'p', eventType: 'item.moved' });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.event_type).toBe('item.moved');
  });

  it('filters by actor', () => {
    auditLog.record({ actor: 'alice', actorType: 'agent', eventType: 'item.created', projectId: 'p', summary: 's1' });
    auditLog.record({ actor: 'bob', actorType: 'agent', eventType: 'item.created', projectId: 'p', summary: 's2' });
    const { rows } = auditLog.query({ projectId: 'p', actor: 'alice' });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.actor).toBe('alice');
  });

  it('filters by date range', () => {
    const now = Date.now();
    auditLog.record({ ts: now - 10_000, actor: 'a', actorType: 'agent', eventType: 'item.created', projectId: 'p', summary: 'old' });
    auditLog.record({ ts: now, actor: 'a', actorType: 'agent', eventType: 'item.created', projectId: 'p', summary: 'new' });
    const { rows } = auditLog.query({ projectId: 'p', since: now - 5_000 });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.summary).toBe('new');
  });

  it('exportCsv produces CSV with headers', () => {
    auditLog.record({ actor: 'test', actorType: 'user', eventType: 'item.created', projectId: 'p', summary: 'created' });
    const csv = auditLog.exportCsv({ projectId: 'p' });
    expect(csv).toContain('id,timestamp,actor');
    expect(csv).toContain('"test"');
  });

  it('rowsToCsv escapes quotes and null values', () => {
    const csv = rowsToCsv([
      {
        actor: 'Jane "QA"',
        actor_type: 'user',
        details: null,
        event_type: 'item.updated',
        id: 7,
        item_id: null,
        item_title: 'Escaped item',
        project_id: 'p',
        summary: 'Changed "brief"',
        ts: 0,
      },
    ]);

    expect(csv).toContain('"Jane ""QA"""');
    expect(csv).toContain('"Changed ""brief"""');
    expect(csv).toContain('1970-01-01T00:00:00.000Z');
  });
});
