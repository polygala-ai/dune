import { safeStorage } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

import type { AppStorage } from './app-storage';

export class EncryptedFileStorage implements AppStorage {
  private data: Record<string, string>;

  private readonly filePath: string;

  constructor(dir: string, name: string) {
    this.filePath = path.join(dir, `${name}.json`);
    this.data = this.readFile();
  }

  async get<T>(key: string): Promise<T | null> {
    const encoded = this.data[key];
    if (encoded === undefined) return null;

    try {
      const decrypted = safeStorage.isEncryptionAvailable()
        ? safeStorage.decryptString(Buffer.from(encoded, 'base64'))
        : encoded;
      return JSON.parse(decrypted) as T;
    } catch {
      return null;
    }
  }

  async set<T>(key: string, value: T): Promise<void> {
    const serialized = JSON.stringify(value);
    this.data[key] = safeStorage.isEncryptionAvailable()
      ? safeStorage.encryptString(serialized).toString('base64')
      : serialized;
    this.writeFile();
  }

  async delete(key: string): Promise<void> {
    delete this.data[key];
    this.writeFile();
  }

  async keys(): Promise<string[]> {
    return Object.keys(this.data);
  }

  private readFile(): Record<string, string> {
    try {
      return JSON.parse(fs.readFileSync(this.filePath, 'utf-8')) as Record<string, string>;
    } catch {
      return {};
    }
  }

  private writeFile() {
    fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2));
  }
}
