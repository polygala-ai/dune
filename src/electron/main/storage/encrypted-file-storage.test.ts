import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: vi.fn(),
    encryptString: vi.fn(),
    decryptString: vi.fn(),
  },
}));

import { safeStorage } from 'electron';

import { EncryptedFileStorage } from './encrypted-file-storage';

const mockSafeStorage = vi.mocked(safeStorage);

function createTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'dune-encrypted-'));
}

describe('EncryptedFileStorage', () => {
  const tempDirs: string[] = [];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      fs.rmSync(dir, { force: true, recursive: true });
    }
  });

  describe('with encryption available', () => {
    beforeEach(() => {
      mockSafeStorage.isEncryptionAvailable.mockReturnValue(true);
      mockSafeStorage.encryptString.mockImplementation((plainText) =>
        Buffer.from(`encrypted:${plainText}`),
      );
      mockSafeStorage.decryptString.mockImplementation((encrypted) =>
        encrypted.toString().replace('encrypted:', ''),
      );
    });

    it('encrypts values before storing', async () => {
      const dir = createTempDir();
      tempDirs.push(dir);
      const store = new EncryptedFileStorage(dir, 'secrets');

      await store.set('apiKey', 'sk-secret-123');

      const raw = JSON.parse(fs.readFileSync(path.join(dir, 'secrets.json'), 'utf-8'));
      const storedValue = raw.apiKey as string;

      expect(storedValue).not.toContain('sk-secret-123');
      expect(mockSafeStorage.encryptString).toHaveBeenCalledWith('"sk-secret-123"');
    });

    it('decrypts values when reading', async () => {
      const dir = createTempDir();
      tempDirs.push(dir);
      const store = new EncryptedFileStorage(dir, 'secrets');

      await store.set('apiKey', 'sk-secret-123');
      expect(await store.get('apiKey')).toBe('sk-secret-123');
      expect(mockSafeStorage.decryptString).toHaveBeenCalled();
    });

    it('round-trips objects through encryption', async () => {
      const dir = createTempDir();
      tempDirs.push(dir);
      const store = new EncryptedFileStorage(dir, 'secrets');

      const data = { token: 'abc', refresh: 'xyz' };
      await store.set('creds', data);
      expect(await store.get('creds')).toEqual(data);
    });

    it('round-trips arrays through encryption', async () => {
      const dir = createTempDir();
      tempDirs.push(dir);
      const store = new EncryptedFileStorage(dir, 'secrets');

      await store.set('keys', ['key1', 'key2']);
      expect(await store.get('keys')).toEqual(['key1', 'key2']);
    });

    it('persists encrypted data across instances', async () => {
      const dir = createTempDir();
      tempDirs.push(dir);

      const store1 = new EncryptedFileStorage(dir, 'secrets');
      await store1.set('apiKey', 'my-secret');

      const store2 = new EncryptedFileStorage(dir, 'secrets');
      expect(await store2.get('apiKey')).toBe('my-secret');
    });
  });

  describe('without encryption (fallback)', () => {
    beforeEach(() => {
      mockSafeStorage.isEncryptionAvailable.mockReturnValue(false);
    });

    it('stores values as plain JSON when encryption is unavailable', async () => {
      const dir = createTempDir();
      tempDirs.push(dir);
      const store = new EncryptedFileStorage(dir, 'secrets');

      await store.set('apiKey', 'sk-plain-123');

      const raw = JSON.parse(fs.readFileSync(path.join(dir, 'secrets.json'), 'utf-8'));
      expect(JSON.parse(raw.apiKey as string)).toBe('sk-plain-123');
    });

    it('reads plain values back correctly', async () => {
      const dir = createTempDir();
      tempDirs.push(dir);
      const store = new EncryptedFileStorage(dir, 'secrets');

      await store.set('apiKey', 'sk-plain-123');
      expect(await store.get('apiKey')).toBe('sk-plain-123');
    });
  });

  describe('common operations', () => {
    beforeEach(() => {
      mockSafeStorage.isEncryptionAvailable.mockReturnValue(false);
    });

    it('returns null for a missing key', async () => {
      const dir = createTempDir();
      tempDirs.push(dir);
      const store = new EncryptedFileStorage(dir, 'secrets');

      expect(await store.get('missing')).toBeNull();
    });

    it('deletes a key', async () => {
      const dir = createTempDir();
      tempDirs.push(dir);
      const store = new EncryptedFileStorage(dir, 'secrets');

      await store.set('key', 'value');
      await store.delete('key');
      expect(await store.get('key')).toBeNull();
    });

    it('returns all keys', async () => {
      const dir = createTempDir();
      tempDirs.push(dir);
      const store = new EncryptedFileStorage(dir, 'secrets');

      await store.set('a', 1);
      await store.set('b', 2);
      expect(await store.keys()).toEqual(['a', 'b']);
    });

    it('starts empty when the file does not exist', async () => {
      const dir = createTempDir();
      tempDirs.push(dir);
      const store = new EncryptedFileStorage(dir, 'nonexistent');

      expect(await store.keys()).toEqual([]);
    });

    it('starts empty when the file contains invalid JSON', async () => {
      const dir = createTempDir();
      tempDirs.push(dir);
      fs.writeFileSync(path.join(dir, 'broken.json'), 'not json');

      const store = new EncryptedFileStorage(dir, 'broken');
      expect(await store.keys()).toEqual([]);
    });

    it('returns null when decryption fails on a corrupted value', async () => {
      const dir = createTempDir();
      tempDirs.push(dir);

      fs.writeFileSync(
        path.join(dir, 'corrupted.json'),
        JSON.stringify({ bad: 'not-valid-base64-or-json!!!' }),
      );

      const store = new EncryptedFileStorage(dir, 'corrupted');
      expect(await store.get('bad')).toBeNull();
    });
  });
});
