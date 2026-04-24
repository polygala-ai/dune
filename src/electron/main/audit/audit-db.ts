import Database from 'better-sqlite3';
import path from 'node:path';

import { AuditLog } from './audit-log';

export {
  ensureAuditEventsSchema,
  rowsToCsv,
} from './audit-log';
export type {
  AuditActorType,
  AuditEvent as RecordEventParams,
  AuditEventRow,
  AuditEventType,
  QueryAuditParams,
} from '@/shared/audit-log';

export class AuditDatabase extends AuditLog {
  private readonly sqlite: InstanceType<typeof Database>;

  constructor(userDataDirOrMemory: string) {
    const sqlite = userDataDirOrMemory === ':memory:'
      ? new Database(':memory:')
      : new Database(path.join(userDataDirOrMemory, 'audit.db'));

    sqlite.pragma('journal_mode = WAL');
    super(sqlite);
    this.sqlite = sqlite;
  }

  close(): void {
    this.sqlite.close();
  }
}
