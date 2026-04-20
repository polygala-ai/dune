// Settings and secrets ORM schema.

import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import type { ModelAuthType } from '@/renderer/features/settings/model/model-providers';
import type { NetworkProxyMode } from '@/renderer/features/settings/model/network-settings';

import {
  GLOBAL_STATE_ROW_ID,
  modelAuthTypes,
  networkProxyModes,
} from './constants';

/** Model providers. */
export const modelProviders = sqliteTable('model_providers', {
  authType: text('auth_type', { enum: modelAuthTypes }).$type<ModelAuthType>().notNull(),
  baseUrl: text('base_url').notNull(),
  id: text('id').primaryKey(),
  isDefault: integer('is_default', { mode: 'boolean' }).notNull(),
  name: text('name').notNull(),
});

/** Network settings singleton. */
export const networkSettings = sqliteTable('network_settings', {
  bypassRules: text('bypass_rules', { mode: 'json' }).$type<string[]>().notNull(),
  id: text('id')
    .primaryKey()
    .$defaultFn(() => GLOBAL_STATE_ROW_ID),
  manualProxyUrl: text('manual_proxy_url').notNull(),
  mode: text('mode', { enum: networkProxyModes }).$type<NetworkProxyMode>().notNull(),
});

/** Generic encrypted secret entries. */
export const secretEntries = sqliteTable('secret_entries', {
  ciphertext: text('ciphertext').notNull(),
  encoding: text('encoding').notNull().default('utf-8'),
  key: text('key').primaryKey(),
  updatedAt: integer('updated_at').notNull().$type<number>(),
});

export type ModelProviderRow = typeof modelProviders.$inferSelect;
export type NewModelProviderRow = typeof modelProviders.$inferInsert;
export type NetworkSettingsRow = typeof networkSettings.$inferSelect;
export type NewNetworkSettingsRow = typeof networkSettings.$inferInsert;
export type SecretEntryRow = typeof secretEntries.$inferSelect;
export type NewSecretEntryRow = typeof secretEntries.$inferInsert;
