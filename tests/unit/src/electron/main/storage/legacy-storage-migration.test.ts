// Legacy JSON to Drizzle repository migration tests.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { createDuneDatabase } from '@/electron/main/db';
import { secretEntries } from '@/electron/main/orm';
import { DrizzleAgentRuntimeStateRepository } from '@/electron/main/persistence/agent-runtime-state-repository';
import { DrizzleSecretsRepository } from '@/electron/main/persistence/secrets-repository';
import { DrizzleSettingsRepository } from '@/electron/main/persistence/settings-repository';
import { DrizzleWorkflowRepository } from '@/electron/main/persistence/workflow-repository';
import type { PersistedAgentRecord } from '@/electron/main/runtime/agent-runtime/records';
import { migrateLegacyStorageToSqlite } from '@/electron/main/storage/legacy-storage-migration';

/** Creates temp dir. */
function createTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'dune-legacy-storage-'));
}

function createRepositories(database: ReturnType<typeof createDuneDatabase>) {
  const secretsRepository = new DrizzleSecretsRepository(database.db);

  return {
    agentStateRepository: new DrizzleAgentRuntimeStateRepository(database.db),
    secretsRepository,
    settingsRepository: new DrizzleSettingsRepository(database.db, secretsRepository),
    workflowRepository: new DrizzleWorkflowRepository(database.db),
  };
}

function createLegacyAgentRecord(id: string, name: string): PersistedAgentRecord {
  return {
    agent: {
      activityEvents: [],
      channel: {
        canCompose: true,
        id: 'dune-chat',
        kind: 'built-in',
        label: 'Dune chat',
        status: 'ready',
      },
      codingEngineEvents: [],
      contextCards: [{
        body: `${name} context`,
        eyebrow: 'Context',
        id: 'shared-context-card',
        title: 'Shared context card',
      }],
      definition: { archetype: 'custom', responsibilities: [] },
      id,
      messages: [],
      name,
      note: 'Imported agent',
      preview: 'Ready',
      projectId: null,
      status: 'ready',
      telegram: null,
      transcript: {
        archivedMessageCount: 0,
        hasOlderMessages: false,
        rollingSummary: null,
        totalMessageCount: 0,
      },
      updatedAt: 1,
      workspace: 'AgentLite agent',
    },
    groupFolder: id,
    projectName: null,
    projectRootPath: null,
    transcriptArchive: null,
  };
}

describe('migrateLegacyStorageToSqlite', () => {
  const tempDirs: string[] = [];
  const closeDatabaseHandles: Array<() => void> = [];

  afterEach(() => {
    for (const close of closeDatabaseHandles.splice(0)) {
      close();
    }

    for (const dir of tempDirs.splice(0)) {
      fs.rmSync(dir, { force: true, recursive: true });
    }
  });

  it('imports known legacy state into typed repositories and secret rows', async () => {
    const dir = createTempDir();
    tempDirs.push(dir);
    fs.writeFileSync(
      path.join(dir, 'agents.json'),
      JSON.stringify({
        agents: [
          createLegacyAgentRecord('agent-1', 'First imported agent'),
          createLegacyAgentRecord('agent-2', 'Second imported agent'),
        ],
        selectedAgentId: 'agent-1',
      }),
    );
    fs.writeFileSync(
      path.join(dir, 'settings.json'),
      JSON.stringify({
        codingEngineSettings: { backendType: 'codex', enabledEngineIds: ['codex'] },
        modelProviders: [{
          authType: 'api-key',
          baseUrl: 'https://example.test/v1',
          id: 'provider-1',
          isDefault: true,
          name: 'Example',
        }],
        network: { bypassRules: ['localhost'], manualProxyUrl: '', mode: 'system' },
      }),
    );
    fs.writeFileSync(
      path.join(dir, 'workflow.json'),
      JSON.stringify({
        snapshot: {
          items: [],
          projects: [],
          selectedItemId: null,
          selectedProjectFilter: 'all',
          selectedProjectId: null,
          selectedProjectView: 'board',
        },
      }),
    );
    fs.writeFileSync(
      path.join(dir, 'secrets.json'),
      JSON.stringify({ apiKey: 'legacy-ciphertext' }),
    );
    const database = createDuneDatabase(path.join(dir, 'dune.sqlite'));
    const repositories = createRepositories(database);
    closeDatabaseHandles.push(() => database.sqlite.close());

    await migrateLegacyStorageToSqlite({
      db: database.db,
      userDataDir: dir,
      ...repositories,
    });

    await expect(repositories.agentStateRepository.load()).resolves.toMatchObject({
      agents: [
        {
          agent: {
            contextCards: [expect.objectContaining({ id: 'shared-context-card' })],
            id: 'agent-1',
          },
        },
        {
          agent: {
            contextCards: [expect.objectContaining({ id: 'shared-context-card' })],
            id: 'agent-2',
          },
        },
      ],
      selectedAgentId: 'agent-1',
    });
    await expect(repositories.settingsRepository.loadModelProviders()).resolves.toEqual([
      {
        authType: 'api-key',
        baseUrl: 'https://example.test/v1',
        id: 'provider-1',
        isDefault: true,
        name: 'Example',
        providerKind: 'anthropic',
      },
    ]);
    await expect(repositories.settingsRepository.loadCodingEngineSettings()).resolves.toEqual({
      backendModel: '',
      backendType: 'codex',
      enabledEngineIds: ['codex'],
    });
    await expect(repositories.workflowRepository.readSnapshot()).resolves.toMatchObject({
      items: [],
      projects: [],
    });
    expect(database.db.select().from(secretEntries).get()).toMatchObject({
      ciphertext: 'legacy-ciphertext',
      encoding: 'legacy',
      key: 'apiKey',
    });
  });

  it('does not import legacy files more than once', async () => {
    const dir = createTempDir();
    tempDirs.push(dir);
    const agentsPath = path.join(dir, 'agents.json');
    fs.writeFileSync(agentsPath, JSON.stringify({ selectedAgentId: 'agent-1' }));
    const database = createDuneDatabase(path.join(dir, 'dune.sqlite'));
    const repositories = createRepositories(database);
    closeDatabaseHandles.push(() => database.sqlite.close());

    await migrateLegacyStorageToSqlite({
      db: database.db,
      userDataDir: dir,
      ...repositories,
    });
    fs.writeFileSync(agentsPath, JSON.stringify({ selectedAgentId: 'agent-2' }));
    await migrateLegacyStorageToSqlite({
      db: database.db,
      userDataDir: dir,
      ...repositories,
    });

    await expect(repositories.agentStateRepository.load()).resolves.toMatchObject({
      selectedAgentId: 'agent-1',
    });
  });
});
