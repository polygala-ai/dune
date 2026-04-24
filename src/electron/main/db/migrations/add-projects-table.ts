// Add app-level project registry tables for SQLite-backed installations.

/** SQL migration for project registry tables. */
export const addProjectsTableMigration = `
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL,
  archivedAt INTEGER,
  sortOrder INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS project_settings (
  projectId TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  defaultAgentId TEXT,
  telegramGroupId TEXT,
  lastActiveAt INTEGER
);

CREATE TABLE IF NOT EXISTS app_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;
