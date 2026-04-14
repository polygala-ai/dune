// Settings rows UI.

import type { SettingsRow } from '@/renderer/features/settings/types';
import { Separator } from '@/renderer/shared/ui/separator';

/** Settings rows props. */
interface SettingsRowsProps {
  rows: SettingsRow[];
}

/** Renders the settings rows UI. */
export function SettingsRows({ rows }: SettingsRowsProps) {
  return (
    <div className="mt-6 border-y border-app-border">
      {rows.map((row, index) => (
        <div key={row.label}>
          {index > 0 ? <Separator /> : null}
          <div className="flex items-center justify-between gap-4 py-4">
            <div>
              <p className="text-sm font-medium text-app-text">{row.label}</p>
              <p className="mt-1 text-xs text-app-muted">{row.description}</p>
            </div>
            <span className="pill-key">{row.value}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
