// Agent message content tests.

import { describe, expect, it } from 'vitest';

import {
  extractWorkspaceAttachmentPaths,
  inferAttachmentKind,
  summarizeMessagePreview,
} from './message-content';

describe('message content helpers', () => {
  it('strips markdown formatting when building previews', () => {
    expect(
      summarizeMessagePreview(
        '# Heading\n\n- **Bold** [docs](https://example.com)\n\n```ts\nconst count = 1;\n```',
      ),
    ).toBe('Heading Bold docs const count = 1;');
  });

  it('infers attachment kinds from mime types and file extensions', () => {
    expect(inferAttachmentKind({ mimeType: 'image/png' })).toBe('image');
    expect(inferAttachmentKind({ name: 'clip.mp4' })).toBe('video');
    expect(inferAttachmentKind({ url: 'file:///tmp/theme.mp3' })).toBe('audio');
    expect(inferAttachmentKind({ name: 'notes.pdf' })).toBe('file');
  });

  it('extracts Telegram-style workspace attachment paths from message text', () => {
    expect(
      extractWorkspaceAttachmentPaths(
        '[Photo] (/workspace/group/attachments/photo_100.png) Look at this',
      ),
    ).toEqual({
      content: '[Photo] Look at this',
      paths: ['/workspace/group/attachments/photo_100.png'],
    });
  });
});
