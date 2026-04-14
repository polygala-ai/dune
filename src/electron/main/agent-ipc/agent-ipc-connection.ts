import fs from 'node:fs';
import path from 'node:path';

import {
  createIpcFileId,
  parseIpcMessage,
  type IpcMessage,
} from './types';

const STREAMING_IDLE_WINDOW_MS = 320;
const STREAMING_SAFETY_TIMEOUT_MS = 30_000;

export interface AgentIpcMessage {
  id: string;
  role: 'assistant' | 'user';
  content: string;
  status: 'complete' | 'streaming';
  createdAt: number;
}

export interface AgentIpcError {
  code: string;
  message: string;
  timestamp: number;
}

export interface AgentIpcConnectionState {
  messages: AgentIpcMessage[];
  isStreaming: boolean;
  lastError: AgentIpcError | null;
}

export interface ToolHandlerContext {
  agentId: string;
  agentName: string;
  projectId: string;
  ipcHostDir: string;
  ipcContainerDir: string;
}

export type ToolMessageHandler = (
  msg: IpcMessage,
  fileId: string,
  replyFn: (reply: IpcMessage) => void,
) => void;

export class AgentIpcConnection {
  private watcher: fs.FSWatcher | null = null;

  private messages: AgentIpcMessage[] = [];

  private lastError: AgentIpcError | null = null;

  private pendingStream: {
    fileId: string;
    content: string;
    idleTimer: ReturnType<typeof setTimeout>;
    safetyTimer: ReturnType<typeof setTimeout>;
  } | null = null;

  private toolMessageHandler: ToolMessageHandler | null = null;

  constructor(
    private readonly agentDir: string,
    private readonly hostDir: string,
    private readonly onChange: () => void,
  ) {}

  setToolMessageHandler(handler: ToolMessageHandler): void {
    this.toolMessageHandler = handler;
  }

  start(): void {
    fs.mkdirSync(this.agentDir, { recursive: true });
    fs.mkdirSync(this.hostDir, { recursive: true });

    this.watcher = fs.watch(this.agentDir, (_event, filename) => {
      if (!filename) return;
      if (filename.endsWith('.json') || filename.endsWith('.done')) {
        this.handleAgentFile(filename);
      }
    });
  }

  /** Manually scan the agent directory for new files. Used for testing. */
  scan(): void {
    try {
      const files = fs.readdirSync(this.agentDir);
      for (const file of files) {
        if (file.endsWith('.json') || file.endsWith('.done')) {
          this.handleAgentFile(file);
        }
      }
    } catch {
      // directory may not exist
    }
  }

  stop(): void {
    this.clearPendingStream();
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
  }

  getState(): AgentIpcConnectionState {
    return {
      messages: [...this.messages],
      isStreaming: this.pendingStream !== null,
      lastError: this.lastError,
    };
  }

  deliverMessage(text: string): void {
    const fileId = createIpcFileId();
    const msg: IpcMessage<'user-message'> = {
      type: 'user-message',
      payload: { text },
    };
    fs.writeFileSync(
      path.join(this.hostDir, `${fileId}.json`),
      JSON.stringify(msg),
    );
    this.messages.push({
      id: fileId,
      role: 'user',
      content: text,
      status: 'complete',
      createdAt: Date.now(),
    });
    this.onChange();
  }

  private handleAgentFile(filename: string): void {
    const filePath = path.join(this.agentDir, filename);

    if (!fs.existsSync(filePath)) return;

    if (filename.endsWith('.done')) {
      this.handleReplyDone(filename, filePath);
    } else if (filename.endsWith('-reply.json')) {
      this.handleReplyChunk(filename, filePath);
    } else if (filename.endsWith('.json')) {
      this.handleAgentMessage(filename, filePath);
    }
  }

  private handleReplyChunk(filename: string, filePath: string): void {
    const raw = this.safeReadFile(filePath);
    if (!raw) return;

    const parsed = parseIpcMessage(raw);
    if (!parsed || parsed.type !== 'reply') return;

    const payload = parsed.payload as { content: string; seq: number };
    const fileId = filename.replace(/-reply\.json$/, '');

    if (this.pendingStream && this.pendingStream.fileId === fileId) {
      this.pendingStream.content = payload.content;
      this.resetIdleTimer(fileId);
    } else {
      this.finalizePendingStream();
      this.pendingStream = {
        fileId,
        content: payload.content,
        idleTimer: setTimeout(() => this.finalizeStream(fileId), STREAMING_IDLE_WINDOW_MS),
        safetyTimer: setTimeout(() => this.finalizeStream(fileId), STREAMING_SAFETY_TIMEOUT_MS),
      };
    }

    this.updateOrCreateAssistantMessage(fileId, payload.content, 'streaming');
    this.onChange();
  }

  private handleReplyDone(filename: string, filePath: string): void {
    const fileId = filename.replace(/-reply\.done$/, '');
    this.finalizeStream(fileId);
    this.safeDeleteFile(filePath);

    const replyJsonPath = path.join(this.agentDir, `${fileId}-reply.json`);
    this.safeDeleteFile(replyJsonPath);
  }

  private handleAgentMessage(filename: string, filePath: string): void {
    const raw = this.safeReadFile(filePath);
    if (!raw) return;

    const fileId = filename.replace(/\.json$/, '');
    const parsed = parseIpcMessage(raw);
    if (!parsed) {
      this.writeReply(fileId, {
        type: 'error',
        payload: {
          code: 'invalid-message',
          message: 'Invalid IPC message. Expected a JSON object with string `type` and `payload` fields.',
        },
      });
      this.safeDeleteFile(filePath);
      this.onChange();
      return;
    }

    if (parsed.type === 'message') {
      const payload = parsed.payload as { content: string };
      this.messages.push({
        id: fileId,
        role: 'assistant',
        content: payload.content,
        status: 'complete',
        createdAt: Date.now(),
      });
      this.safeDeleteFile(filePath);
      this.onChange();
    } else if (parsed.type === 'error') {
      const payload = parsed.payload as { code: string; message: string };
      this.lastError = {
        code: payload.code,
        message: payload.message,
        timestamp: Date.now(),
      };
      this.safeDeleteFile(filePath);
      this.onChange();
    } else if (this.toolMessageHandler) {
      // Tool protocol messages — delegate to handler
      this.toolMessageHandler(parsed, fileId, (reply) => {
        this.writeReply(fileId, reply);
      });
      this.safeDeleteFile(filePath);
    } else {
      this.safeDeleteFile(filePath);
    }
  }

  private updateOrCreateAssistantMessage(
    fileId: string,
    content: string,
    status: 'complete' | 'streaming',
  ): void {
    const existing = this.messages.find(
      (m) => m.id === `${fileId}-reply` && m.role === 'assistant',
    );
    if (existing) {
      existing.content = content;
      existing.status = status;
    } else {
      this.messages.push({
        id: `${fileId}-reply`,
        role: 'assistant',
        content,
        status,
        createdAt: Date.now(),
      });
    }
  }

  private finalizeStream(fileId: string): void {
    if (!this.pendingStream || this.pendingStream.fileId !== fileId) return;

    this.updateOrCreateAssistantMessage(
      fileId,
      this.pendingStream.content,
      'complete',
    );
    this.clearPendingStream();
    this.onChange();
  }

  private finalizePendingStream(): void {
    if (this.pendingStream) {
      this.finalizeStream(this.pendingStream.fileId);
    }
  }

  private resetIdleTimer(fileId: string): void {
    if (!this.pendingStream || this.pendingStream.fileId !== fileId) return;
    clearTimeout(this.pendingStream.idleTimer);
    this.pendingStream.idleTimer = setTimeout(
      () => this.finalizeStream(fileId),
      STREAMING_IDLE_WINDOW_MS,
    );
  }

  private clearPendingStream(): void {
    if (this.pendingStream) {
      clearTimeout(this.pendingStream.idleTimer);
      clearTimeout(this.pendingStream.safetyTimer);
      this.pendingStream = null;
    }
  }

  private writeReply(fileId: string, reply: IpcMessage): void {
    const replyPath = path.join(this.hostDir, `${fileId}-reply.json`);
    fs.writeFileSync(replyPath, JSON.stringify(reply));
  }

  private safeReadFile(filePath: string): string | null {
    try {
      return fs.readFileSync(filePath, 'utf-8');
    } catch {
      return null;
    }
  }

  private safeDeleteFile(filePath: string): void {
    try {
      fs.unlinkSync(filePath);
    } catch {
      // file may already be deleted
    }
  }
}
