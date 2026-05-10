// Drizzle-backed encrypted secret persistence.

import { safeStorage } from 'electron';
import { asc, eq } from 'drizzle-orm';

import type { DuneDatabase } from '@/electron/main/db';
import { secretEntries } from '@/electron/main/orm';

const SAFE_STORAGE_BASE64_ENCODING = 'safe-storage-base64';
const PLAIN_JSON_ENCODING = 'plain-json';
const LEGACY_SECRET_ENCODING = 'legacy';

/** Secret persistence contract used by runtime and settings services. */
export interface SecretsRepository {
  delete(key: string): Promise<void>;
  get<T>(key: string): Promise<T | null>;
  importLegacyCiphertext(key: string, ciphertext: string): Promise<void>;
  keys(): Promise<string[]>;
  set<T>(key: string, value: T): Promise<void>;
}

/** Decodes one persisted secret payload. */
function decodeSecretPayload(ciphertext: string, encoding: string): unknown | null {
  const serializedCandidates: string[] = [];

  if (encoding !== PLAIN_JSON_ENCODING && safeStorage.isEncryptionAvailable()) {
    try {
      serializedCandidates.push(safeStorage.decryptString(Buffer.from(ciphertext, 'base64')));
    } catch {
      // Fall through to plain JSON for legacy fallback payloads.
    }
  }

  serializedCandidates.push(ciphertext);

  for (const serialized of serializedCandidates) {
    try {
      return JSON.parse(serialized) as unknown;
    } catch {
      // Try the next candidate.
    }
  }

  return null;
}

/** Encodes one secret payload for persistence. */
function encodeSecretPayload(value: unknown) {
  const serialized = JSON.stringify(value);

  if (safeStorage.isEncryptionAvailable()) {
    return {
      ciphertext: safeStorage.encryptString(serialized).toString('base64'),
      encoding: SAFE_STORAGE_BASE64_ENCODING,
    };
  }

  return {
    ciphertext: serialized,
    encoding: PLAIN_JSON_ENCODING,
  };
}

/** Drizzle implementation for encrypted secret persistence. */
export class DrizzleSecretsRepository implements SecretsRepository {
  constructor(private readonly db: DuneDatabase) {}

  get<T>(key: string): Promise<T | null> {
    const row = this.db
      .select({
        ciphertext: secretEntries.ciphertext,
        encoding: secretEntries.encoding,
      })
      .from(secretEntries)
      .where(eq(secretEntries.key, key))
      .get();

    if (!row) {
      return Promise.resolve(null);
    }

    return Promise.resolve(decodeSecretPayload(row.ciphertext, row.encoding) as T | null);
  }

  set<T>(key: string, value: T): Promise<void> {
    if (typeof value === 'undefined') {
      throw new Error(`Cannot persist undefined secret value for "${key}".`);
    }

    const { ciphertext, encoding } = encodeSecretPayload(value);
    this.upsertSecret(key, ciphertext, encoding);
    return Promise.resolve();
  }

  delete(key: string): Promise<void> {
    this.db.delete(secretEntries).where(eq(secretEntries.key, key)).run();
    return Promise.resolve();
  }

  keys(): Promise<string[]> {
    return Promise.resolve(this.db
      .select({ key: secretEntries.key })
      .from(secretEntries)
      .orderBy(asc(secretEntries.key))
      .all()
      .map((row) => row.key));
  }

  importLegacyCiphertext(key: string, ciphertext: string): Promise<void> {
    this.upsertSecret(key, ciphertext, LEGACY_SECRET_ENCODING);
    return Promise.resolve();
  }

  private upsertSecret(key: string, ciphertext: string, encoding: string): void {
    const updatedAt = Date.now();

    this.db
      .insert(secretEntries)
      .values({
        ciphertext,
        encoding,
        key,
        updatedAt,
      })
      .onConflictDoUpdate({
        set: {
          ciphertext,
          encoding,
          updatedAt,
        },
        target: secretEntries.key,
      })
      .run();
  }
}
