// Add project scoping columns to SQLite-backed tables when missing.

const LEGACY_PROJECT_ID = '2bqWpDY6';

/** SQL migration for project IDs on existing tables. */
export const addProjectIdColumnsMigration = `
ALTER TABLE workflow_items ADD COLUMN projectId TEXT;
ALTER TABLE agents ADD COLUMN projectId TEXT;
ALTER TABLE messages ADD COLUMN projectId TEXT;
ALTER TABLE workflow_events ADD COLUMN projectId TEXT;
ALTER TABLE workflow_tasks ADD COLUMN projectId TEXT;
ALTER TABLE work_products ADD COLUMN projectId TEXT;

UPDATE workflow_items SET projectId = '${LEGACY_PROJECT_ID}' WHERE projectId IS NULL;
UPDATE agents SET projectId = '${LEGACY_PROJECT_ID}' WHERE projectId IS NULL;
UPDATE messages SET projectId = '${LEGACY_PROJECT_ID}' WHERE projectId IS NULL;
UPDATE workflow_events SET projectId = '${LEGACY_PROJECT_ID}' WHERE projectId IS NULL;
UPDATE workflow_tasks SET projectId = '${LEGACY_PROJECT_ID}' WHERE projectId IS NULL;
UPDATE work_products SET projectId = '${LEGACY_PROJECT_ID}' WHERE projectId IS NULL;
`;
