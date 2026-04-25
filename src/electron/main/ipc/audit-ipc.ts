import type { AuditEvent, QueryAuditParams } from '@/shared/audit-log';
import { ipcChannels } from '@/shared/electron/ipc-channels';
import type { AuditLog } from '@/electron/main/audit/audit-log';

interface IpcMainLike {
  handle(channel: string, listener: (...args: any[]) => any): void;
}

interface RegisterAuditIpcHandlersOptions {
  auditLog?: AuditLog | undefined;
  ipcMain: IpcMainLike;
}

/** Registers audit-log IPC handlers. */
export function registerAuditIpcHandlers({
  auditLog,
  ipcMain,
}: RegisterAuditIpcHandlersOptions): void {
  ipcMain.handle(
    ipcChannels.getAuditLog,
    async (_event, params: QueryAuditParams) => auditLog?.query(params) ?? { rows: [], total: 0 },
  );
  ipcMain.handle(
    ipcChannels.exportAuditCsv,
    async (_event, params: QueryAuditParams) => auditLog?.exportCsv(params) ?? '',
  );
  ipcMain.handle(
    ipcChannels.recordAuditEvent,
    async (_event, event: AuditEvent) => {
      auditLog?.record(event);
    },
  );
}
