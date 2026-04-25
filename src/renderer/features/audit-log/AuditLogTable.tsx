import type { AuditEventRow } from '@/shared/audit-log';

interface AuditLogTableProps {
  loading: boolean;
  rows: AuditEventRow[];
}

function formatTimestamp(timestamp: number) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(timestamp));
}

/** Renders the audit event table. */
export function AuditLogTable({
  loading,
  rows,
}: AuditLogTableProps) {
  return (
    <div className="overflow-hidden rounded-[20px] border border-app-border bg-app-panel/70">
      <div className="overflow-x-auto">
        <table className="min-w-[920px] w-full border-collapse text-left text-sm">
          <thead className="border-b border-app-border bg-app-card/60 text-[11px] uppercase tracking-[0.18em] text-app-muted">
            <tr>
              <th className="px-4 py-3 font-semibold">Timestamp</th>
              <th className="px-4 py-3 font-semibold">Actor</th>
              <th className="px-4 py-3 font-semibold">Event Type</th>
              <th className="px-4 py-3 font-semibold">Item</th>
              <th className="px-4 py-3 font-semibold">Summary</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-app-border">
            {loading ? (
              <tr>
                <td className="px-4 py-8 text-center text-app-muted" colSpan={5}>
                  Loading audit log
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td className="px-4 py-8 text-center text-app-muted" colSpan={5}>
                  No audit events match these filters.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr className="bg-app-panel/40 align-top" key={row.id}>
                  <td className="whitespace-nowrap px-4 py-3 text-app-muted">
                    {formatTimestamp(row.ts)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-app-text">{row.actor}</div>
                    <div className="mt-1 text-xs text-app-muted">{row.actor_type}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="pill-key border-transparent bg-app-card">
                      {row.event_type}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-app-text">
                    {row.item_title ? (
                      <div className="max-w-[220px] truncate">{row.item_title}</div>
                    ) : (
                      <span className="text-app-muted">-</span>
                    )}
                    {row.item_id ? (
                      <div className="mt-1 max-w-[220px] truncate text-xs text-app-muted">{row.item_id}</div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 leading-6 text-app-text">{row.summary}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
