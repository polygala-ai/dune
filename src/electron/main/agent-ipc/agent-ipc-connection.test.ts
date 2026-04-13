import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AgentIpcConnection } from './agent-ipc-connection';

function createTempIpcDirs() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'dune-ipc-test-'));
  const agentDir = path.join(base, 'agent');
  const hostDir = path.join(base, 'host');
  fs.mkdirSync(agentDir, { recursive: true });
  fs.mkdirSync(hostDir, { recursive: true });
  return { base, agentDir, hostDir };
}

describe('AgentIpcConnection', () => {
  let dirs: ReturnType<typeof createTempIpcDirs>;
  let connection: AgentIpcConnection;
  let onChangeCalls: number;

  beforeEach(() => {
    dirs = createTempIpcDirs();
    onChangeCalls = 0;
    connection = new AgentIpcConnection(dirs.agentDir, dirs.hostDir, () => { onChangeCalls++; });
    connection.start();
  });

  afterEach(() => {
    connection.stop();
    fs.rmSync(dirs.base, { recursive: true, force: true });
  });

  it('starts with empty state', () => {
    const state = connection.getState();
    expect(state.messages).toEqual([]);
    expect(state.isStreaming).toBe(false);
    expect(state.lastError).toBeNull();
  });

  it('delivers a user message as a JSON file in host/', () => {
    connection.deliverMessage('hello agent');

    const files = fs.readdirSync(dirs.hostDir);
    expect(files).toHaveLength(1);

    const content = JSON.parse(fs.readFileSync(path.join(dirs.hostDir, files[0]!), 'utf-8'));
    expect(content.type).toBe('user-message');
    expect(content.payload.text).toBe('hello agent');

    const state = connection.getState();
    expect(state.messages).toHaveLength(1);
    expect(state.messages[0]!.role).toBe('user');
    expect(state.messages[0]!.content).toBe('hello agent');
  });

  it('reads agent-initiated messages and deletes the file', () => {
    const filename = `${Date.now()}-test.json`;
    fs.writeFileSync(
      path.join(dirs.agentDir, filename),
      JSON.stringify({ type: 'message', payload: { content: 'hello from agent' } }),
    );

    connection.scan();

    const state = connection.getState();
    expect(state.messages.some((m) => m.content === 'hello from agent')).toBe(true);
    expect(fs.existsSync(path.join(dirs.agentDir, filename))).toBe(false);
    expect(onChangeCalls).toBeGreaterThan(0);
  });

  it('reads agent error messages', () => {
    fs.writeFileSync(
      path.join(dirs.agentDir, `${Date.now()}-err.json`),
      JSON.stringify({ type: 'error', payload: { code: 'timeout', message: 'LLM timed out' } }),
    );

    connection.scan();

    const state = connection.getState();
    expect(state.lastError).toEqual(expect.objectContaining({
      code: 'timeout',
      message: 'LLM timed out',
    }));
  });

  it('replies with an error for malformed IPC messages', () => {
    const fileId = `${Date.now()}-bad-tools-list`;
    fs.writeFileSync(
      path.join(dirs.agentDir, `${fileId}.json`),
      JSON.stringify({ type: 'tools/list', id: 'req-001' }),
    );

    connection.scan();

    const replyPath = path.join(dirs.hostDir, `${fileId}-reply.json`);
    expect(fs.existsSync(replyPath)).toBe(true);
    expect(fs.existsSync(path.join(dirs.agentDir, `${fileId}.json`))).toBe(false);

    const reply = JSON.parse(fs.readFileSync(replyPath, 'utf-8'));
    expect(reply).toEqual({
      type: 'error',
      payload: {
        code: 'invalid-message',
        message: 'Invalid IPC message. Expected a JSON object with string `type` and `payload` fields.',
      },
    });
  });

  it('handles streaming reply chunks', () => {
    const fileId = `${Date.now()}-stream`;

    fs.writeFileSync(
      path.join(dirs.agentDir, `${fileId}-reply.json`),
      JSON.stringify({ type: 'reply', payload: { content: 'Hello', seq: 1 } }),
    );
    connection.scan();

    expect(connection.getState().isStreaming).toBe(true);
    const msg = connection.getState().messages.find((m) => m.id === `${fileId}-reply`);
    expect(msg?.content).toBe('Hello');
    expect(msg?.status).toBe('streaming');
  });

  it('finalizes streaming on .done', () => {
    const fileId = `${Date.now()}-done`;

    fs.writeFileSync(
      path.join(dirs.agentDir, `${fileId}-reply.json`),
      JSON.stringify({ type: 'reply', payload: { content: 'Complete', seq: 1 } }),
    );
    connection.scan();
    expect(connection.getState().isStreaming).toBe(true);

    fs.writeFileSync(
      path.join(dirs.agentDir, `${fileId}-reply.done`),
      JSON.stringify({ type: 'reply-done', payload: {} }),
    );
    connection.scan();

    expect(connection.getState().isStreaming).toBe(false);
    const msg = connection.getState().messages.find((m) => m.id === `${fileId}-reply`);
    expect(msg?.status).toBe('complete');
    expect(msg?.content).toBe('Complete');
  });

  it('delegates tool protocol messages to the handler and writes reply', () => {
    const toolHandler = vi.fn((msg, _fileId, replyFn) => {
      if (msg.type === 'tools/list') {
        replyFn({ type: 'tools/list-result', payload: { tools: [] } });
      }
    });
    connection.setToolMessageHandler(toolHandler);

    const fileId = `${Date.now()}-tools`;
    fs.writeFileSync(
      path.join(dirs.agentDir, `${fileId}.json`),
      JSON.stringify({ type: 'tools/list', payload: {} }),
    );
    connection.scan();

    expect(toolHandler).toHaveBeenCalled();
    const replyPath = path.join(dirs.hostDir, `${fileId}-reply.json`);
    expect(fs.existsSync(replyPath)).toBe(true);
    const reply = JSON.parse(fs.readFileSync(replyPath, 'utf-8'));
    expect(reply.type).toBe('tools/list-result');
  });

  it('ignores non-json/done files', () => {
    fs.writeFileSync(path.join(dirs.agentDir, 'readme.txt'), 'not a message');
    connection.scan();
    expect(onChangeCalls).toBe(0);
  });
});
