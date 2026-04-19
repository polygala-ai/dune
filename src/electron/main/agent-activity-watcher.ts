// Real-time agent activity file watching.

import fs from 'node:fs';
import path from 'node:path';

import { BrowserWindow } from 'electron';

import { readAgentActivityStatus } from '@/electron/main/runtime/agent-activity';
import type {
  AgentActivityEntry,
  AgentActivityUpdatePayload,
} from '@/shared/agents/agent-activity';
import { ipcChannels } from '@/shared/electron/ipc-channels';

type AgentActivityResolver = (agentId: string) => Promise<AgentActivityEntry | null>;

export class AgentActivityWatcher {
  private readonly watchers = new Map<string, fs.FSWatcher>();

  private resolveActivity: AgentActivityResolver | null = null;

  setResolver(resolveActivity: AgentActivityResolver): void {
    this.resolveActivity = resolveActivity;
  }

  start(agentDataDirs: string[]): void {
    const nextTargets = new Set(agentDataDirs);

    for (const dataDir of this.watchers.keys()) {
      if (!nextTargets.has(dataDir)) {
        this.unwatch(dataDir);
      }
    }

    for (const dataDir of nextTargets) {
      if (!this.watchers.has(dataDir)) {
        this.watchDataDir(dataDir);
      }
    }
  }

  stop(): void {
    for (const watcher of this.watchers.values()) {
      watcher.close();
    }

    this.watchers.clear();
  }

  broadcastActivity(activity: AgentActivityEntry): void {
    const payload: AgentActivityUpdatePayload = activity;

    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) {
        window.webContents.send(ipcChannels.agentActivityUpdated, payload);
      }
    }
  }

  private watchDataDir(dataDir: string): void {
    const ipcDir = path.join(dataDir, 'ipc');
    const statusPath = path.join(ipcDir, 'status.json');
    fs.mkdirSync(ipcDir, { recursive: true });

    if (fs.existsSync(statusPath)) {
      this.unwatch(dataDir);

      const watcher = fs.watch(statusPath, (eventType) => {
        if (eventType === 'rename') {
          this.watchDataDir(dataDir);
        }

        void this.handleStatusChange(dataDir);
      });

      this.watchers.set(dataDir, watcher);
      void this.handleStatusChange(dataDir);
      return;
    }

    this.unwatch(dataDir);

    const watcher = fs.watch(ipcDir, (_eventType, filename) => {
      const resolvedFilename =
        typeof filename === 'string'
          ? filename
          : null;

      if (resolvedFilename !== 'status.json') {
        return;
      }

      this.watchDataDir(dataDir);
      void this.handleStatusChange(dataDir);
    });

    this.watchers.set(dataDir, watcher);
  }

  private unwatch(dataDir: string): void {
    this.watchers.get(dataDir)?.close();
    this.watchers.delete(dataDir);
  }

  private async handleStatusChange(dataDir: string): Promise<void> {
    const status = readAgentActivityStatus(dataDir);

    if (!status) {
      return;
    }

    try {
      const activity = await this.resolveActivity?.(status.agentId);

      this.broadcastActivity(
        activity ?? {
          agentId: status.agentId,
          agentName: status.agentName,
          isAlive: true,
          status,
        },
      );
    } catch (error) {
      console.error(`Failed to resolve agent activity for "${status.agentId}".`, error);
    }
  }
}

export const agentActivityWatcher = new AgentActivityWatcher();
