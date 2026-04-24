import { Download } from 'lucide-react';

import { AuditLogFilters } from '@/renderer/features/audit-log/AuditLogFilters';
import { AuditLogTable } from '@/renderer/features/audit-log/AuditLogTable';
import { useAuditLog } from '@/renderer/features/audit-log/useAuditLog';
import { Button } from '@/renderer/shared/ui/button';

interface AuditLogViewProps {
  projectId: string;
}

/** Renders the project audit log view. */
export function AuditLogView({ projectId }: AuditLogViewProps) {
  const {
    PAGE_SIZE,
    exportCsv,
    filters,
    loading,
    page,
    rows,
    setFilters,
    setPage,
    total,
  } = useAuditLog(projectId);
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const firstRow = total === 0 ? 0 : page * PAGE_SIZE + 1;
  const lastRow = Math.min(total, (page + 1) * PAGE_SIZE);

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="surface-eyebrow">Audit</div>
          <h3 className="mt-2 text-xl font-semibold text-app-text">Audit Log</h3>
        </div>
        <Button
          onClick={() => {
            void exportCsv();
          }}
          type="button"
          variant="outline"
        >
          <Download className="h-4 w-4" />
          Export CSV
        </Button>
      </div>

      <AuditLogFilters
        filters={filters}
        onChange={(nextFilters) => {
          setPage(0);
          setFilters(nextFilters);
        }}
      />

      <AuditLogTable loading={loading} rows={rows} />

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-app-muted">
        <div>
          Showing {firstRow}-{lastRow} of {total}
        </div>
        <div className="flex items-center gap-2">
          <Button
            disabled={page === 0 || loading}
            onClick={() => setPage((current) => Math.max(0, current - 1))}
            size="sm"
            type="button"
            variant="quiet"
          >
            Previous
          </Button>
          <span className="pill-key border-transparent bg-app-panel">
            Page {page + 1} of {pageCount}
          </span>
          <Button
            disabled={page >= pageCount - 1 || loading}
            onClick={() => setPage((current) => Math.min(pageCount - 1, current + 1))}
            size="sm"
            type="button"
            variant="quiet"
          >
            Next
          </Button>
        </div>
      </div>
    </section>
  );
}
