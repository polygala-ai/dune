import fs from 'node:fs';
import path from 'node:path';

import type { AppStorage } from './app-storage';

export class JsonFileStorage implements AppStorage {
  private data: Record<string, unknown>;

  private readonly filePath: string;

  constructor(dir: string, name: string) {
    this.filePath = path.join(dir, `${name}.json`);
    this.data = this.readFile();
  }

  async get<T>(key: string): Promise<T | null> {
    return (this.data[key] as T) ?? null;
  }

  async set<T>(key: string, value: T): Promise<void> {
    this.data[key] = value;
    this.writeFile();
  }

  async delete(key: string): Promise<void> {
    delete this.data[key];
    this.writeFile();
  }

  async keys(): Promise<string[]> {
    return Object.keys(this.data);
  }

  private readFile(): Record<string, unknown> {
    try {
      return JSON.parse(fs.readFileSync(this.filePath, 'utf-8')) as Record<string, unknown>;
    } catch {
      return {};
    }
  }

  private writeFile() {
    fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2));
  }
}
