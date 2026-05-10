// Drizzle-backed settings persistence.

import { eq } from 'drizzle-orm';

import type { DuneDatabase } from '@/electron/main/db';
import {
  codingEngineSettings,
  GLOBAL_STATE_ROW_ID,
  modelProviders,
  networkSettings,
} from '@/electron/main/orm';
import {
  getModelProviderSecretKey,
  normalizeModelProviders,
  type ModelProvider,
} from '@/renderer/features/settings/model/model-providers';
import {
  normalizeCodingEngineSettings,
  type CodingEngineSettings,
} from '@/renderer/features/settings/model/coding-engine-settings';
import {
  normalizeNetworkSettings,
  validateNetworkSettings,
  type NetworkSettings,
} from '@/renderer/features/settings/model/network-settings';

import type { SecretsRepository } from './secrets-repository';

const CLAUDE_CODE_OAUTH_TOKEN_ENV = 'CLAUDE_CODE_OAUTH_TOKEN';
const ANTHROPIC_API_KEY_ENV = 'ANTHROPIC_API_KEY';
const ANTHROPIC_BASE_URL_ENV = 'ANTHROPIC_BASE_URL';
const OPENAI_API_KEY_ENV = 'OPENAI_API_KEY';
const OPENAI_BASE_URL_ENV = 'OPENAI_BASE_URL';

/** Main-process settings API backed by Drizzle repositories. */
export class DrizzleSettingsRepository {
  constructor(
    private readonly db: DuneDatabase,
    private readonly secrets: SecretsRepository,
  ) {}

  loadModelProviders(): Promise<ModelProvider[]> {
    return Promise.resolve(normalizeModelProviders(this.db
      .select()
      .from(modelProviders)
      .all()
      .sort((left, right) => left.name.localeCompare(right.name))));
  }

  saveModelProviders(providers: ModelProvider[]): Promise<ModelProvider[]> {
    const normalized = normalizeModelProviders(providers);

    this.db.transaction((tx) => {
      tx.delete(modelProviders).run();

      if (normalized.length > 0) {
        tx.insert(modelProviders).values(normalized).run();
      }
    });

    return Promise.resolve(normalized);
  }

  readModelProviderSecret(providerId: string): Promise<string> {
    return this.readStringSecret(getModelProviderSecretKey(providerId));
  }

  async writeModelProviderSecret(providerId: string, value: string): Promise<void> {
    await this.writeStringSecret(getModelProviderSecretKey(providerId), value);
  }

  deleteModelProviderSecret(providerId: string): Promise<void> {
    return this.secrets.delete(getModelProviderSecretKey(providerId));
  }

  loadNetworkSettings(): Promise<NetworkSettings> {
    const row = this.db
      .select()
      .from(networkSettings)
      .where(eq(networkSettings.id, GLOBAL_STATE_ROW_ID))
      .get();

    return Promise.resolve(normalizeNetworkSettings(row ?? null));
  }

  saveNetworkSettings(settings: NetworkSettings): Promise<NetworkSettings> {
    const validated = validateNetworkSettings(settings);

    this.db
      .insert(networkSettings)
      .values({
        ...validated,
        id: GLOBAL_STATE_ROW_ID,
      })
      .onConflictDoUpdate({
        set: validated,
        target: networkSettings.id,
      })
      .run();

    return Promise.resolve(validated);
  }

  loadCodingEngineSettings(): Promise<CodingEngineSettings> {
    const row = this.db
      .select()
      .from(codingEngineSettings)
      .where(eq(codingEngineSettings.id, GLOBAL_STATE_ROW_ID))
      .get();

    return Promise.resolve(normalizeCodingEngineSettings(row ?? null));
  }

  saveCodingEngineSettings(settings: CodingEngineSettings): Promise<CodingEngineSettings> {
    const normalized = normalizeCodingEngineSettings(settings);

    this.db
      .insert(codingEngineSettings)
      .values({
        ...normalized,
        id: GLOBAL_STATE_ROW_ID,
      })
      .onConflictDoUpdate({
        set: normalized,
        target: codingEngineSettings.id,
      })
      .run();

    return Promise.resolve(normalized);
  }

  async resolveDefaultModelCredentials(): Promise<Record<string, string>> {
    const providers = await this.loadModelProviders();
    const credentials: Record<string, string> = {};
    const prioritizedProviders = [
      ...providers.filter((provider) => provider.isDefault),
      ...providers.filter((provider) => !provider.isDefault),
    ];

    for (const provider of prioritizedProviders) {
      const secret = await this.readModelProviderSecret(provider.id);

      if (!secret) {
        continue;
      }

      if (provider.authType === 'oauth-token') {
        credentials[CLAUDE_CODE_OAUTH_TOKEN_ENV] ??= secret;
        continue;
      }

      if (provider.providerKind === 'openai') {
        credentials[OPENAI_API_KEY_ENV] ??= secret;
        if (provider.baseUrl) {
          credentials[OPENAI_BASE_URL_ENV] ??= provider.baseUrl;
        }
        continue;
      }

      credentials[ANTHROPIC_API_KEY_ENV] ??= secret;
      if (provider.baseUrl) {
        credentials[ANTHROPIC_BASE_URL_ENV] ??= provider.baseUrl;
      }
    }

    return credentials;
  }

  private async readStringSecret(key: string): Promise<string> {
    const value = await this.secrets.get<string>(key);
    return typeof value === 'string' ? value : '';
  }

  private async writeStringSecret(key: string, value: string): Promise<void> {
    const trimmedValue = value.trim();

    if (!trimmedValue) {
      await this.secrets.delete(key);
      return;
    }

    await this.secrets.set(key, trimmedValue);
  }
}
