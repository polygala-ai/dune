// Drizzle settings repository tests.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  safeStorage: {
    decryptString: vi.fn((buffer: Buffer) => buffer.toString('utf8')),
    encryptString: vi.fn((value: string) => Buffer.from(value, 'utf8')),
    isEncryptionAvailable: vi.fn(() => false),
  },
}));

import { createDuneDatabase } from '@/electron/main/db';
import { DrizzleSecretsRepository } from '@/electron/main/persistence/secrets-repository';
import { DrizzleSettingsRepository } from '@/electron/main/persistence/settings-repository';

/** Creates a temporary test repository bundle. */
function createRepositories() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dune-settings-repository-'));
  const database = createDuneDatabase(path.join(dir, 'dune.sqlite'));
  const secretsRepository = new DrizzleSecretsRepository(database.db);

  return {
    close: () => {
      database.sqlite.close();
      fs.rmSync(dir, { force: true, recursive: true });
    },
    settingsRepository: new DrizzleSettingsRepository(database.db, secretsRepository),
  };
}

describe('DrizzleSettingsRepository', () => {
  const cleanup: Array<() => void> = [];

  afterEach(() => {
    for (const close of cleanup.splice(0)) {
      close();
    }
  });

  it('normalizes providers and resolves oauth credentials from repository secrets', async () => {
    const { close, settingsRepository } = createRepositories();
    cleanup.push(close);

    await settingsRepository.saveModelProviders([
      {
        authType: 'oauth-token',
        baseUrl: 'should-clear',
        id: 'provider-1',
        isDefault: true,
        name: 'Claude Code',
        providerKind: 'openai',
      },
      {
        authType: 'api-key',
        baseUrl: ' https://compatible.example/v1 ',
        id: 'provider-2',
        isDefault: true,
        name: ' Compatible ',
        providerKind: 'anthropic',
      },
    ]);
    await settingsRepository.writeModelProviderSecret('provider-1', ' oauth-secret ');

    await expect(settingsRepository.loadModelProviders()).resolves.toEqual([
      {
        authType: 'oauth-token',
        baseUrl: '',
        id: 'provider-1',
        isDefault: true,
        name: 'Claude Code',
        providerKind: 'anthropic',
      },
      {
        authType: 'api-key',
        baseUrl: 'https://compatible.example/v1',
        id: 'provider-2',
        isDefault: false,
        name: 'Compatible',
        providerKind: 'anthropic',
      },
    ]);
    await expect(settingsRepository.resolveDefaultModelCredentials()).resolves.toEqual({
      CLAUDE_CODE_OAUTH_TOKEN: 'oauth-secret',
    });
  });

  it('resolves api-key credentials and omits empty defaults', async () => {
    const { close, settingsRepository } = createRepositories();
    cleanup.push(close);

    await settingsRepository.saveModelProviders([
      {
        authType: 'api-key',
        baseUrl: 'https://compatible.example/v1',
        id: 'provider-1',
        isDefault: true,
        name: 'Compatible',
        providerKind: 'anthropic',
      },
    ]);

    await expect(settingsRepository.resolveDefaultModelCredentials()).resolves.toEqual({});

    await settingsRepository.writeModelProviderSecret('provider-1', 'api-secret');

    await expect(settingsRepository.resolveDefaultModelCredentials()).resolves.toEqual({
      ANTHROPIC_API_KEY: 'api-secret',
      ANTHROPIC_BASE_URL: 'https://compatible.example/v1',
    });
  });

  it('resolves OpenAI credentials alongside Claude credentials', async () => {
    const { close, settingsRepository } = createRepositories();
    cleanup.push(close);

    await settingsRepository.saveModelProviders([
      {
        authType: 'oauth-token',
        baseUrl: '',
        id: 'provider-1',
        isDefault: true,
        name: 'Claude Code',
        providerKind: 'anthropic',
      },
      {
        authType: 'api-key',
        baseUrl: 'https://api.openai.com/v1',
        id: 'provider-2',
        isDefault: false,
        name: 'OpenAI',
        providerKind: 'openai',
      },
    ]);
    await settingsRepository.writeModelProviderSecret('provider-1', 'oauth-secret');
    await settingsRepository.writeModelProviderSecret('provider-2', 'openai-secret');

    await expect(settingsRepository.resolveDefaultModelCredentials()).resolves.toEqual({
      CLAUDE_CODE_OAUTH_TOKEN: 'oauth-secret',
      OPENAI_API_KEY: 'openai-secret',
      OPENAI_BASE_URL: 'https://api.openai.com/v1',
    });
  });
});
