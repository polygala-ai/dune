import type { AuditEventRow } from '@/shared/audit-log';

const auditCsvHeaders = [
  'id',
  'timestamp',
  'actor',
  'actor_type',
  'event_type',
  'item_id',
  'item_title',
  'project_id',
  'summary',
  'details',
] as const;

function escapeCsvValue(value: unknown): string {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

/** Converts audit log rows into a downloadable CSV payload. */
export function rowsToCsv(rows: AuditEventRow[]): string {
  return [
    auditCsvHeaders.join(','),
    ...rows.map((row) => [
      row.id,
      new Date(row.ts).toISOString(),
      escapeCsvValue(row.actor),
      escapeCsvValue(row.actor_type),
      escapeCsvValue(row.event_type),
      escapeCsvValue(row.item_id),
      escapeCsvValue(row.item_title),
      escapeCsvValue(row.project_id),
      escapeCsvValue(row.summary),
      escapeCsvValue(row.details),
    ].join(',')),
  ].join('\n');
}
