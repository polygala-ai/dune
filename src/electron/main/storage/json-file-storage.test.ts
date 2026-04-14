// JSON file storage tests.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { JsonFileStorage } from './json-file-storage';

/** Creates temp dir. */
function createTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'dune-storage-'));
}

describe('JsonFileStorage', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      fs.rmSync(dir, { force: true, recursive: true });
    }
  });

  it('returns null for a missing key', async () => {
    const dir = createTempDir();
    tempDirs.push(dir);
    const store = new JsonFileStorage(dir, 'test');

    expect(await store.get('missing')).toBeNull();
  });

  it('stores and retrieves a string value', async () => {
    const dir = createTempDir();
    tempDirs.push(dir);
    const store = new JsonFileStorage(dir, 'test');

    await store.set('name', 'OpenAI');
    expect(await store.get('name')).toBe('OpenAI');
  });

  it('stores and retrieves an object value', async () => {
    const dir = createTempDir();
    tempDirs.push(dir);
    const store = new JsonFileStorage(dir, 'test');

    const provider = { id: '1', name: 'Kimi', baseUrl: 'https://api.moonshot.cn/v1' };
    await store.set('provider', provider);
    expect(await store.get('provider')).toEqual(provider);
  });

  it('stores and retrieves an array value', async () => {
    const dir = createTempDir();
    tempDirs.push(dir);
    const store = new JsonFileStorage(dir, 'test');

    await store.set('items', [1, 2, 3]);
    expect(await store.get('items')).toEqual([1, 2, 3]);
  });

  it('overwrites an existing key', async () => {
    const dir = createTempDir();
    tempDirs.push(dir);
    const store = new JsonFileStorage(dir, 'test');

    await store.set('key', 'first');
    await store.set('key', 'second');
    expect(await store.get('key')).toBe('second');
  });

  it('deletes a key', async () => {
    const dir = createTempDir();
    tempDirs.push(dir);
    const store = new JsonFileStorage(dir, 'test');

    await store.set('key', 'value');
    await store.delete('key');
    expect(await store.get('key')).toBeNull();
  });

  it('deleting a non-existent key does not throw', async () => {
    const dir = createTempDir();
    tempDirs.push(dir);
    const store = new JsonFileStorage(dir, 'test');

    await expect(store.delete('missing')).resolves.toBeUndefined();
  });

  it('returns all keys', async () => {
    const dir = createTempDir();
    tempDirs.push(dir);
    const store = new JsonFileStorage(dir, 'test');

    await store.set('a', 1);
    await store.set('b', 2);
    await store.set('c', 3);
    expect(await store.keys()).toEqual(['a', 'b', 'c']);
  });

  it('returns empty keys for a fresh store', async () => {
    const dir = createTempDir();
    tempDirs.push(dir);
    const store = new JsonFileStorage(dir, 'test');

    expect(await store.keys()).toEqual([]);
  });

  it('persists data to disk and survives a new instance', async () => {
    const dir = createTempDir();
    tempDirs.push(dir);

    const store1 = new JsonFileStorage(dir, 'persist');
    await store1.set('theme', 'dark');
    await store1.set('providers', [{ id: '1' }]);

    const store2 = new JsonFileStorage(dir, 'persist');
    expect(await store2.get('theme')).toBe('dark');
    expect(await store2.get('providers')).toEqual([{ id: '1' }]);
  });

  it('writes valid JSON to the file', async () => {
    const dir = createTempDir();
    tempDirs.push(dir);
    const store = new JsonFileStorage(dir, 'test');

    await store.set('key', 'value');

    const raw = fs.readFileSync(path.join(dir, 'test.json'), 'utf-8');
    expect(JSON.parse(raw)).toEqual({ key: 'value' });
  });

  it('starts empty when the file does not exist', async () => {
    const dir = createTempDir();
    tempDirs.push(dir);
    const store = new JsonFileStorage(dir, 'nonexistent');

    expect(await store.keys()).toEqual([]);
    expect(await store.get('anything')).toBeNull();
  });

  it('starts empty when the file contains invalid JSON', async () => {
    const dir = createTempDir();
    tempDirs.push(dir);
    fs.writeFileSync(path.join(dir, 'broken.json'), '{invalid json!!!');

    const store = new JsonFileStorage(dir, 'broken');
    expect(await store.keys()).toEqual([]);
  });

  it('handles multiple stores in the same directory', async () => {
    const dir = createTempDir();
    tempDirs.push(dir);

    const settings = new JsonFileStorage(dir, 'settings');
    const state = new JsonFileStorage(dir, 'state');

    await settings.set('theme', 'light');
    await state.set('route', 'agent');

    expect(await settings.get('theme')).toBe('light');
    expect(await settings.get('route')).toBeNull();
    expect(await state.get('route')).toBe('agent');
    expect(await state.get('theme')).toBeNull();
  });
});
