// Drizzle SQLite client helpers.

import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';

import { duneSchema } from '@/electron/main/orm';

/** Resolves the app database file path. */
export function resolveDuneDatabasePath(userDataDir: string) {
  return path.join(userDataDir, 'dune.sqlite');
}

/** Opens the raw SQLite database with pragmatic defaults for the desktop app. */
export function openDuneDatabase(databasePath: string) {
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });

  const sqlite = new Database(databasePath);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');

  return sqlite;
}

/** Applies lightweight app-managed SQLite migrations. */
export function runDuneMigrations(sqlite: Database.Database) {
  sqlite.exec('CREATE TABLE IF NOT EXISTS dune_migrations (id TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)');

  const migrationId = '001_priority_sla';
  const exists = sqlite
    .prepare('SELECT 1 FROM dune_migrations WHERE id = ?')
    .get(migrationId);

  if (exists) {
    return;
  }

  const columns = sqlite.prepare('PRAGMA table_info(workflow_items)').all() as Array<{ name: string }>;
  if (columns.length === 0) {
    return;
  }

  const columnNames = new Set(columns.map((column) => column.name));

  sqlite.transaction(() => {
    if (!columnNames.has('priority')) {
      sqlite.exec(`ALTER TABLE workflow_items ADD COLUMN priority TEXT NOT NULL DEFAULT 'medium'
        CHECK (priority IN ('critical','high','medium','low'))`);
    }
    if (!columnNames.has('sla_deadline_ms')) {
      sqlite.exec('ALTER TABLE workflow_items ADD COLUMN sla_deadline_ms INTEGER');
    }
    if (!columnNames.has('sla_warned_at')) {
      sqlite.exec('ALTER TABLE workflow_items ADD COLUMN sla_warned_at INTEGER');
    }
    if (!columnNames.has('sla_breached_at')) {
      sqlite.exec('ALTER TABLE workflow_items ADD COLUMN sla_breached_at INTEGER');
    }

    sqlite
      .prepare('INSERT INTO dune_migrations (id, applied_at) VALUES (?, ?)')
      .run(migrationId, Date.now());
  })();
}

/** Creates the Drizzle database wrapper and exposes the raw client for migrations. */
export function createDuneDatabase(databasePath: string) {
  const sqlite = openDuneDatabase(databasePath);
  runDuneMigrations(sqlite);

  return {
    db: drizzle(sqlite, { schema: duneSchema }),
    sqlite,
  };
}

/** Typed Drizzle database shape for Dune's SQLite schema. */
export type DuneDatabase = BetterSQLite3Database<typeof duneSchema>;
