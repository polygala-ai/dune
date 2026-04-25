// Reads per-agent status files for the activity panel's initial snapshot.

import fs from 'node:fs';
import path from 'node:path';

import type { AgentActivityStatus } from '@/shared/agents/agent-activity';

function compareStatuses(left: AgentActivityStatus, right: AgentActivityStatus) {
  const leftUpdatedAt = Date.parse(left.updatedAt);
  const rightUpdatedAt = Date.parse(right.updatedAt);

  if (leftUpdatedAt !== rightUpdatedAt) {
    return rightUpdatedAt - leftUpdatedAt;
  }

  return left.agentName.localeCompare(right.agentName);
}

function isAgentActivityStatus(value: unknown): value is AgentActivityStatus {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const record = value as Record<string, unknown>;

  return record.schemaVersion === 1
    && typeof record.updatedAt === 'string'
    && typeof record.agentId === 'string'
    && typeof record.agentName === 'string'
    && typeof record.status === 'string'
    && typeof record.phase === 'string'
    && (record.lastToolResultSummary === null || typeof record.lastToolResultSummary === 'string')
    && typeof record.turnCount === 'number'
    && typeof record.sessionId === 'string'
    && typeof record.sessionStartedAt === 'string';
}

function statusPathForDataDir(dataDir: string) {
  return path.join(dataDir, 'ipc', 'status.json');
}

export class AgentActivityWatcher {
  private readonly statusByDataDir = new Map<string, AgentActivityStatus>();

  private readonly watchers = new Map<string, fs.FSWatcher>();

  start(agentDataDirs: string[]): void {
    const nextDataDirs = new Set(agentDataDirs.map((dataDir) => path.resolve(dataDir)));

    for (const [dataDir, watcher] of this.watchers) {
      if (nextDataDirs.has(dataDir)) {
        continue;
      }

      watcher.close();
      this.watchers.delete(dataDir);
      this.statusByDataDir.delete(dataDir);
    }

    for (const dataDir of nextDataDirs) {
      if (!this.watchers.has(dataDir)) {
        const watcher = this.createWatcher(dataDir);

        if (watcher) {
          this.watchers.set(dataDir, watcher);
        }
      }

      this.refreshStatus(dataDir);
    }
  }

  stop(): void {
    for (const watcher of this.watchers.values()) {
      watcher.close();
    }

    this.watchers.clear();
    this.statusByDataDir.clear();
  }

  getStatuses(): AgentActivityStatus[] {
    return [...this.statusByDataDir.values()]
      .sort(compareStatuses)
      .map((status) => ({ ...status }));
  }

  private createWatcher(dataDir: string): fs.FSWatcher | null {
    const ipcDir = path.dirname(statusPathForDataDir(dataDir));

    if (!fs.existsSync(ipcDir)) {
      return null;
    }

    return fs.watch(ipcDir, (_eventType, filename) => {
      if (filename && filename !== 'status.json' && filename !== 'status.json.tmp') {
        return;
      }

      this.refreshStatus(dataDir);
    });
  }

  private refreshStatus(dataDir: string): boolean {
    const statusPath = statusPathForDataDir(dataDir);

    try {
      const nextStatus = JSON.parse(
        fs.readFileSync(statusPath, 'utf8'),
      ) as unknown;

      if (!isAgentActivityStatus(nextStatus)) {
        return false;
      }

      const previousStatus = this.statusByDataDir.get(dataDir);

      if (
        previousStatus
        && JSON.stringify(previousStatus) === JSON.stringify(nextStatus)
      ) {
        return false;
      }

      this.statusByDataDir.set(dataDir, nextStatus);
      return true;
    } catch (error) {
      const missingFile = error instanceof Error && 'code' in error && error.code === 'ENOENT';

      if (missingFile) {
        return this.statusByDataDir.delete(dataDir);
      }

      console.warn(`Failed to read agent activity status from "${statusPath}".`, error);
      return false;
    }
  }
}
