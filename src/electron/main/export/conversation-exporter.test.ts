import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import {
  exportAsJson,
  exportAsMarkdown,
} from '@/electron/main/export/conversation-exporter';
import type { AgentMessage } from '@/renderer/features/agents/types';

function createMessage(overrides: Partial<AgentMessage> = {}): AgentMessage {
  return {
    attachments: [],
    content: '',
    createdAt: Date.UTC(2026, 3, 19, 14, 28, 0),
    format: 'markdown',
    id: 'message-1',
    role: 'assistant',
    status: 'complete',
    ...overrides,
  };
}

describe('conversation exporter', () => {
  const tempDirectories: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirectories.splice(0).map((directoryPath) =>
      fs.rm(directoryPath, { force: true, recursive: true })
    ));
  });

  it('exports JSON with rewritten attachment paths and copied assets', async () => {
    const tempDirectoryPath = await fs.mkdtemp(path.join(os.tmpdir(), 'dune-export-json-'));
    tempDirectories.push(tempDirectoryPath);
    const sourceAssetPath = path.join(tempDirectoryPath, 'photo.png');
    const exportFilePath = path.join(tempDirectoryPath, 'conversation.json');

    await fs.writeFile(sourceAssetPath, 'png-bytes', 'utf8');

    await exportAsJson({
      exportedAt: '2026-04-19T14:30:00.000Z',
      filePath: exportFilePath,
      groupId: 'agent-1',
      groupName: 'Navigator',
      messages: [
        createMessage({
          attachments: [
            {
              kind: 'image',
              name: 'photo.png',
              url: pathToFileURL(sourceAssetPath).toString(),
            },
          ],
          content: 'See [photo](/workspace/group/attachments/photo.png)',
          role: 'user',
        }),
      ],
    });

    const exportedJson = JSON.parse(await fs.readFile(exportFilePath, 'utf8')) as {
      exportedAt: string;
      groupId: string;
      groupName: string;
      messages: Array<{
        actor: string;
        attachments: Array<{ url: string }>;
        content: string;
        timestamp: string;
      }>;
    };
    const copiedAssetPath = path.join(tempDirectoryPath, 'assets', 'photo.png');

    expect(exportedJson).toMatchObject({
      exportedAt: '2026-04-19T14:30:00.000Z',
      groupId: 'agent-1',
      groupName: 'Navigator',
    });
    expect(exportedJson.messages[0]).toMatchObject({
      actor: 'You',
      content: 'See [photo](assets/photo.png)',
      timestamp: '2026-04-19T14:28:00.000Z',
    });
    expect(exportedJson.messages[0]?.attachments[0]?.url).toBe('assets/photo.png');
    await expect(fs.readFile(copiedAssetPath, 'utf8')).resolves.toBe('png-bytes');
  });

  it('exports Markdown with actor headings and attachment references', async () => {
    const tempDirectoryPath = await fs.mkdtemp(path.join(os.tmpdir(), 'dune-export-markdown-'));
    tempDirectories.push(tempDirectoryPath);
    const sourceAssetPath = path.join(tempDirectoryPath, 'diagram.png');
    const exportFilePath = path.join(tempDirectoryPath, 'conversation.md');

    await fs.writeFile(sourceAssetPath, 'diagram-bytes', 'utf8');

    await exportAsMarkdown({
      exportedAt: '2026-04-19T14:30:00.000Z',
      filePath: exportFilePath,
      groupId: 'agent-1',
      groupName: 'Navigator',
      messages: [
        createMessage({
          attachments: [
            {
              kind: 'image',
              name: 'diagram.png',
              url: pathToFileURL(sourceAssetPath).toString(),
            },
          ],
          content: 'Final response with an image.',
        }),
      ],
    });

    const markdown = await fs.readFile(exportFilePath, 'utf8');

    expect(markdown).toContain('# Conversation Export — Navigator');
    expect(markdown).toContain('Exported: 2026-04-19T14:30:00.000Z');
    expect(markdown).toContain('## [Navigator] — 2026-04-19 14:28:00');
    expect(markdown).toContain('Final response with an image.');
    expect(markdown).toContain('![diagram.png](assets/diagram.png)');
    await expect(fs.readFile(path.join(tempDirectoryPath, 'assets', 'diagram.png'), 'utf8')).resolves.toBe('diagram-bytes');
  });
});
