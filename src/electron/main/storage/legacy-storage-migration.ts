// One-time import from legacy JSON files into Drizzle repositories.

import fs from 'node:fs';
import path from 'node:path';

import { sql } from 'drizzle-orm';

import type { DuneDatabase } from '@/electron/main/db';
import type { AgentRuntimeStateRepository } from '@/electron/main/persistence/agent-runtime-state-repository';
import type { SecretsRepository } from '@/electron/main/persistence/secrets-repository';
import type { DrizzleSettingsRepository } from '@/electron/main/persistence/settings-repository';
import type { WorkflowSnapshotStore } from '@/electron/main/persistence/workflow-repository';
import type { PersistedAgentRecord } from '@/electron/main/runtime/agent-runtime/records';
import {
  MODEL_PROVIDERS_KEY,
  type ModelProvider,
} from '@/renderer/features/settings/model/model-providers';
import {
  CODING_ENGINE_SETTINGS_KEY,
  type CodingEngineSettings,
} from '@/renderer/features/settings/model/coding-engine-settings';
import {
  NETWORK_SETTINGS_KEY,
  type NetworkSettings,
} from '@/renderer/features/settings/model/network-settings';
import type { WorkflowSnapshot } from '@/renderer/features/workflow/types';
import {
  createPersistedWorkflowItemActivityArchive,
  getWorkflowItemActivityArchiveItemId,
} from '@/shared/workflow/activity';

const LEGACY_IMPORT_KEY = 'legacy-storage-imported:v2';

interface LegacyStorageMigrationOptions {
  agentStateRepository: AgentRuntimeStateRepository;
  db: DuneDatabase;
  secretsRepository: SecretsRepository;
  settingsRepository: DrizzleSettingsRepository;
  userDataDir: string;
  workflowRepository: WorkflowSnapshotStore;
}

/** Reads one legacy JSON storage file. */
function readLegacyJsonFile<T>(userDataDir: string, name: string): T | null {
  try {
    return JSON.parse(
      fs.readFileSync(path.join(userDataDir, `${name}.json`), 'utf-8'),
    ) as T;
  } catch {
    return null;
  }
}

/** Returns whether a value is a plain keyed object. */
function isKeyedObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function ensureMigrationTable(db: DuneDatabase): void {
  db.run(sql`
    CREATE TABLE IF NOT EXISTS dune_data_migrations (
      id text PRIMARY KEY,
      completed_at integer NOT NULL
    )
  `);
}

function hasMigrationRun(db: DuneDatabase): boolean {
  ensureMigrationTable(db);

  return Boolean(db.get(sql`
    SELECT id FROM dune_data_migrations WHERE id = ${LEGACY_IMPORT_KEY}
  `));
}

function markMigrationRun(db: DuneDatabase): void {
  ensureMigrationTable(db);
  db.run(sql`
    INSERT INTO dune_data_migrations (id, completed_at)
    VALUES (${LEGACY_IMPORT_KEY}, ${Date.now()})
    ON CONFLICT(id) DO UPDATE SET completed_at = excluded.completed_at
  `);
}

async function importAgents(
  userDataDir: string,
  agentStateRepository: AgentRuntimeStateRepository,
): Promise<void> {
  const data = readLegacyJsonFile<Record<string, unknown>>(userDataDir, 'agents');

  if (!isKeyedObject(data)) {
    return;
  }

  await agentStateRepository.save({
    agents: Array.isArray(data.agents) ? data.agents as PersistedAgentRecord[] : [],
    selectedAgentId: typeof data.selectedAgentId === 'string' ? data.selectedAgentId : null,
  });
}

async function importSettings(
  userDataDir: string,
  settingsRepository: DrizzleSettingsRepository,
): Promise<void> {
  const data = readLegacyJsonFile<Record<string, unknown>>(userDataDir, 'settings');

  if (!isKeyedObject(data)) {
    return;
  }

  if (Array.isArray(data[MODEL_PROVIDERS_KEY])) {
    await settingsRepository.saveModelProviders(data[MODEL_PROVIDERS_KEY] as ModelProvider[]);
  }

  if (data[NETWORK_SETTINGS_KEY]) {
    await settingsRepository.saveNetworkSettings(data[NETWORK_SETTINGS_KEY] as NetworkSettings);
  }

  if (data[CODING_ENGINE_SETTINGS_KEY]) {
    await settingsRepository.saveCodingEngineSettings(
      data[CODING_ENGINE_SETTINGS_KEY] as CodingEngineSettings,
    );
  }
}

async function importWorkflow(
  userDataDir: string,
  workflowRepository: WorkflowSnapshotStore,
): Promise<void> {
  const data = readLegacyJsonFile<Record<string, unknown>>(userDataDir, 'workflow');

  if (!isKeyedObject(data)) {
    return;
  }

  if (data.snapshot) {
    await workflowRepository.writeSnapshot(data.snapshot as WorkflowSnapshot);
  }

  for (const [key, value] of Object.entries(data)) {
    const itemId = getWorkflowItemActivityArchiveItemId(key);

    if (!itemId) {
      continue;
    }

    await workflowRepository.writeActivityArchive(
      itemId,
      createPersistedWorkflowItemActivityArchive(value as Record<string, unknown>),
    );
  }
}

async function importSecrets(
  userDataDir: string,
  secretsRepository: SecretsRepository,
): Promise<void> {
  const data = readLegacyJsonFile<Record<string, unknown>>(userDataDir, 'secrets');

  if (!isKeyedObject(data)) {
    return;
  }

  await Promise.all(Object.entries(data).map(async ([key, ciphertext]) => {
    if (typeof ciphertext === 'string') {
      await secretsRepository.importLegacyCiphertext(key, ciphertext);
    }
  }));
}

/** Imports legacy JSON-backed local state once per SQLite database. */
export async function migrateLegacyStorageToSqlite({
  agentStateRepository,
  db,
  secretsRepository,
  settingsRepository,
  userDataDir,
  workflowRepository,
}: LegacyStorageMigrationOptions) {
  if (hasMigrationRun(db)) {
    return;
  }

  await importAgents(userDataDir, agentStateRepository);
  await importSettings(userDataDir, settingsRepository);
  await importWorkflow(userDataDir, workflowRepository);
  await importSecrets(userDataDir, secretsRepository);

  markMigrationRun(db);
}
