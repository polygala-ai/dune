import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AuditDatabase } from './audit-db';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

describe('AuditDatabase', () => {
  let tmpDir: string;
  let auditDb: AuditDatabase;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-test-'));
    auditDb = new AuditDatabase(tmpDir);
  });

  afterEach(() => {
    auditDb.close();
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('records and queries events', () => {
    auditDb.record({
      actor: 'test-agent',
      actorType: 'agent',
      eventType: 'item.created',
      projectId: 'proj-1',
      itemId: 'item-1',
      itemTitle: 'Test Item',
      summary: 'Test item created',
    });

    const { rows, total } = auditDb.query({ projectId: 'proj-1' });
    expect(total).toBe(1);
    expect(rows[0]!.actor).toBe('test-agent');
    expect(rows[0]!.event_type).toBe('item.created');
  });

  it('filters by event_type', () => {
    auditDb.record({ actor: 'a', actorType: 'agent', eventType: 'item.created', projectId: 'p', summary: 's' });
    auditDb.record({ actor: 'a', actorType: 'agent', eventType: 'item.moved', projectId: 'p', summary: 's' });

    const { rows } = auditDb.query({ projectId: 'p', eventType: 'item.created' });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.event_type).toBe('item.created');
  });

  it('exports valid CSV', () => {
    auditDb.record({ actor: 'user', actorType: 'user', eventType: 'item.moved', projectId: 'p', summary: 'moved' });
    const csv = auditDb.exportCsv({ projectId: 'p' });
    const lines = csv.split('\n');
    expect(lines[0]).toContain('timestamp');
    expect(lines.length).toBe(2);
  });
});
