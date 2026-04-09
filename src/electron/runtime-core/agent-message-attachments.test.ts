import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { describe, expect, it } from 'vitest';

import { normalizeAgentAttachments } from './agent-message-attachments';

describe('agent message attachments', () => {
  it('normalizes workspace attachment paths into local file URLs', () => {
    const runtimeRoot = '/tmp/dune-runtime';
    const groupFolder = 'release-triage-1234abcd';

    expect(
      normalizeAgentAttachments(
        ['/workspace/group/attachments/photo_100.png'],
        { groupFolder, runtimeRoot },
      ),
    ).toEqual([
      {
        kind: 'image',
        name: 'photo_100.png',
        url: pathToFileURL(
          path.join(runtimeRoot, 'groups', groupFolder, 'attachments', 'photo_100.png'),
        ).toString(),
      },
    ]);
  });
});
