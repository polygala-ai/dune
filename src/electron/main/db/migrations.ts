// Bundled SQLite schema migrations for the desktop database.

import type Database from 'better-sqlite3';

import initialSchemaSql from '@/electron/main/orm/migrations/0000_mysterious_nebula.sql?raw';
import agentContextCardsCompositePkSql from '@/electron/main/orm/migrations/0001_agent_context_cards_composite_pk.sql?raw';
import agentBackendModelSql from '@/electron/main/orm/migrations/0002_agent_backend_model.sql?raw';
import modelProviderKindSql from '@/electron/main/orm/migrations/0003_model_provider_kind.sql?raw';

interface SqlMigration {
  id: string;
  sql: string;
}

const migrations: SqlMigration[] = [
  {
    id: '0000_mysterious_nebula',
    sql: initialSchemaSql,
  },
  {
    id: '0001_agent_context_cards_composite_pk',
    sql: agentContextCardsCompositePkSql,
  },
  {
    id: '0002_agent_backend_model',
    sql: agentBackendModelSql,
  },
  {
    id: '0003_model_provider_kind',
    sql: modelProviderKindSql,
  },
];

/** Splits drizzle-kit SQL migration files into executable statements. */
function splitMigrationStatements(sql: string) {
  return sql
    .split('--> statement-breakpoint')
    .map((statement) => statement.trim())
    .map((statement) =>
      statement
        .replace(/^CREATE TABLE /, 'CREATE TABLE IF NOT EXISTS ')
        .replace(/^CREATE INDEX /, 'CREATE INDEX IF NOT EXISTS '))
    .filter(Boolean);
}

/** Ensures the local migration ledger exists. */
function ensureMigrationLedger(sqlite: Database.Database) {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS dune_schema_migrations (
      id TEXT PRIMARY KEY NOT NULL,
      applied_at INTEGER NOT NULL
    )
  `);
}

/** Runs bundled Dune database migrations. */
export function runDuneDatabaseMigrations(sqlite: Database.Database) {
  ensureMigrationLedger(sqlite);

  const hasMigration = sqlite.prepare(
    'SELECT 1 FROM dune_schema_migrations WHERE id = ?',
  );
  const markMigrationApplied = sqlite.prepare(
    'INSERT INTO dune_schema_migrations (id, applied_at) VALUES (?, ?)',
  );
  const runMigration = sqlite.transaction((migration: SqlMigration) => {
    for (const statement of splitMigrationStatements(migration.sql)) {
      sqlite.exec(statement);
    }

    markMigrationApplied.run(migration.id, Date.now());
  });

  for (const migration of migrations) {
    if (hasMigration.get(migration.id)) {
      continue;
    }

    runMigration(migration);
  }
}
