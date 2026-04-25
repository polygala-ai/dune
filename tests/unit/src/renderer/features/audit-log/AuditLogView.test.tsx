// Audit log view tests.

import {
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import { AuditLogView } from '@/renderer/features/audit-log/AuditLogView';

describe('AuditLogView', () => {
  it('loads audit rows and renders the filterable table', async () => {
    const getAuditLog = vi.fn(() => Promise.resolve({
      rows: [
        {
          actor: 'Research agent',
          actor_type: 'agent' as const,
          details: null,
          event_type: 'item.created' as const,
          id: 1,
          item_id: 'item-1',
          item_title: 'Audit item',
          project_id: 'project-1',
          summary: 'Created work item "Audit item".',
          ts: Date.UTC(2026, 0, 1, 12, 0, 0),
        },
      ],
      total: 1,
    }));

    window.duneDesktop = {
      ...window.duneDesktop,
      getAuditLog,
      platform: 'darwin',
    };

    render(<AuditLogView projectId="project-1" />);

    expect(screen.getByRole('heading', { name: 'Audit Log' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('Research agent')).toBeInTheDocument());
    expect(within(screen.getByRole('table')).getByText('item.created')).toBeInTheDocument();
    expect(screen.getByText('Audit item')).toBeInTheDocument();
    expect(screen.getByText('Created work item "Audit item".')).toBeInTheDocument();
    expect(getAuditLog).toHaveBeenLastCalledWith({
      limit: 50,
      offset: 0,
      projectId: 'project-1',
    });
  });

  it('exports the current audit filters as CSV', async () => {
    const user = userEvent.setup();
    const exportAuditCsv = vi.fn(() => Promise.resolve('id,timestamp\n'));
    const createObjectUrl = vi.fn(() => 'blob:audit-log');
    const revokeObjectUrl = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: createObjectUrl,
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: revokeObjectUrl,
    });

    window.duneDesktop = {
      ...window.duneDesktop,
      exportAuditCsv,
      getAuditLog: vi.fn(() => Promise.resolve({ rows: [], total: 0 })),
      platform: 'darwin',
    };

    render(<AuditLogView projectId="project-1" />);
    await user.selectOptions(screen.getByLabelText(/Event/i), 'task.updated');
    await user.click(screen.getByRole('button', { name: /Export CSV/i }));

    await waitFor(() =>
      expect(exportAuditCsv).toHaveBeenCalledWith({
        eventType: 'task.updated',
        projectId: 'project-1',
      }));
    expect(click).toHaveBeenCalled();
  });
});
