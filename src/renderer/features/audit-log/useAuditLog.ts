import {
  useCallback,
  useEffect,
  useState,
} from 'react';

import type {
  AuditEventRow,
  QueryAuditParams,
} from '@/shared/audit-log';

export function useAuditLog(projectId: string) {
  const PAGE_SIZE = 50;
  const [filters, setFilters] = useState<Omit<QueryAuditParams, 'projectId' | 'limit' | 'offset'>>({});
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState<AuditEventRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    window.duneDesktop?.getAuditLog?.({
      projectId,
      ...filters,
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    })
      .then((result: { rows: AuditEventRow[]; total: number } | undefined) => {
        setRows(result?.rows ?? []);
        setTotal(result?.total ?? 0);
      })
      .catch(() => {
        setRows([]);
        setTotal(0);
      })
      .finally(() => setLoading(false));
  }, [projectId, filters, page]);

  const exportCsv = useCallback(async () => {
    const csv = await window.duneDesktop?.exportAuditCsv?.({ projectId, ...filters });
    if (!csv) {
      return;
    }

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-log-${projectId}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [projectId, filters]);

  return {
    PAGE_SIZE,
    exportCsv,
    filters,
    loading,
    page,
    rows,
    setFilters,
    setPage,
    total,
  };
}
