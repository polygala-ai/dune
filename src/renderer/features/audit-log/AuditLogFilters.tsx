import {
  auditEventTypes,
  type QueryAuditParams,
} from '@/shared/audit-log';
import { Button } from '@/renderer/shared/ui/button';
import { Input } from '@/renderer/shared/ui/input';

type AuditFilters = Omit<QueryAuditParams, 'projectId' | 'limit' | 'offset'>;

interface AuditLogFiltersProps {
  filters: AuditFilters;
  onChange: (filters: AuditFilters) => void;
}

function dateInputValue(timestamp: number | undefined) {
  return timestamp ? new Date(timestamp).toISOString().slice(0, 10) : '';
}

function parseDate(value: string, endOfDay = false) {
  if (!value) {
    return undefined;
  }

  const date = new Date(`${value}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}`);
  return Number.isNaN(date.getTime()) ? undefined : date.getTime();
}

/** Renders audit log filters. */
export function AuditLogFilters({
  filters,
  onChange,
}: AuditLogFiltersProps) {
  const update = (next: AuditFilters) => {
    onChange(Object.fromEntries(
      Object.entries(next).filter(([, value]) => value !== ''),
    ) as AuditFilters);
  };
  const updateValue = <Key extends keyof AuditFilters>(
    key: Key,
    value: AuditFilters[Key] | undefined,
  ) => {
    const next = { ...filters };

    if (value === undefined || value === '') {
      delete next[key];
    } else {
      next[key] = value;
    }

    update(next);
  };

  return (
    <div className="grid gap-3 rounded-[20px] border border-app-border bg-app-panel/70 p-4 md:grid-cols-2 xl:grid-cols-[160px_160px_220px_minmax(0,1fr)_minmax(0,1fr)_auto]">
      <label className="space-y-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-app-muted">From</span>
        <Input
          onChange={(event) => updateValue('since', parseDate(event.target.value))}
          type="date"
          value={dateInputValue(filters.since)}
        />
      </label>

      <label className="space-y-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-app-muted">To</span>
        <Input
          onChange={(event) => updateValue('until', parseDate(event.target.value, true))}
          type="date"
          value={dateInputValue(filters.until)}
        />
      </label>

      <label className="space-y-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-app-muted">Event</span>
        <select
          className="focus-ring-app h-11 w-full rounded-[16px] border border-app-border bg-app-panel px-3 text-sm text-app-text outline-none transition-colors focus-visible:border-app-border-strong focus-visible:ring-2"
          onChange={(event) => updateValue('eventType', event.target.value || undefined)}
          value={filters.eventType ?? ''}
        >
          <option value="">All events</option>
          {auditEventTypes.map((eventType) => (
            <option key={eventType} value={eventType}>{eventType}</option>
          ))}
        </select>
      </label>

      <label className="space-y-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-app-muted">Actor</span>
        <Input
          onChange={(event) => updateValue('actor', event.target.value || undefined)}
          placeholder="Agent or user"
          value={filters.actor ?? ''}
        />
      </label>

      <label className="space-y-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-app-muted">Item ID</span>
        <Input
          onChange={(event) => updateValue('itemId', event.target.value || undefined)}
          placeholder="item-..."
          value={filters.itemId ?? ''}
        />
      </label>

      <div className="flex items-end">
        <Button
          className="w-full"
          onClick={() => onChange({})}
          type="button"
          variant="ghost"
        >
          Clear
        </Button>
      </div>
    </div>
  );
}
