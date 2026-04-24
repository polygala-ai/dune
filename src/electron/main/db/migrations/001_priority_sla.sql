ALTER TABLE workflow_items ADD COLUMN priority TEXT NOT NULL DEFAULT 'medium'
  CHECK (priority IN ('critical','high','medium','low'));
ALTER TABLE workflow_items ADD COLUMN sla_deadline_ms INTEGER;
ALTER TABLE workflow_items ADD COLUMN sla_warned_at INTEGER;
ALTER TABLE workflow_items ADD COLUMN sla_breached_at INTEGER;
