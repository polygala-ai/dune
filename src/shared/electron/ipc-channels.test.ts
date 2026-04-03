import { describe, expect, it } from 'vitest';

import { ipcChannels } from './ipc-channels';

describe('ipcChannels', () => {
  it('has unique channel values (no duplicate IPC strings)', () => {
    const values = Object.values(ipcChannels);
    const unique = new Set(values);

    expect(unique.size).toBe(values.length);
  });

  it('all channels use the dune: prefix', () => {
    for (const channel of Object.values(ipcChannels)) {
      expect(channel).toMatch(/^dune:/);
    }
  });

  it('runtime channels use dune:runtime: prefix', () => {
    const runtimeKeys = ['createAgent', 'getRuntimeSnapshot', 'resetRuntime', 'restartApp', 'runtimeSnapshotUpdated', 'selectAgent', 'sendAgentMessage'];

    for (const key of runtimeKeys) {
      expect(ipcChannels[key as keyof typeof ipcChannels]).toMatch(/^dune:runtime:/);
    }
  });

  it('storage channels use dune:storage: prefix', () => {
    const storageKeys = ['storageDelete', 'storageGet', 'storageKeys', 'storageSet'];

    for (const key of storageKeys) {
      expect(ipcChannels[key as keyof typeof ipcChannels]).toMatch(/^dune:storage:/);
    }
  });
});
