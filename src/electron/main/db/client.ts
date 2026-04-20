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

/** Creates the Drizzle database wrapper and exposes the raw client for migrations. */
export function createDuneDatabase(databasePath: string) {
  const sqlite = openDuneDatabase(databasePath);

  return {
    db: drizzle(sqlite, { schema: duneSchema }),
    sqlite,
  };
}

/** Typed Drizzle database shape for Dune's SQLite schema. */
export type DuneDatabase = BetterSQLite3Database<typeof duneSchema>;
