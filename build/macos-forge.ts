import type { ForgeConfig } from '@electron-forge/shared-types';
import type { MakerDMGConfig } from '@electron-forge/maker-dmg';

type PackagerConfig = NonNullable<ForgeConfig['packagerConfig']>;

export interface MacReleaseConfig {
  appBundleId: string;
  appCategoryType: string;
  iconBasePath: string;
}

const appStoreConnectEnvKeys = [
  'APPLE_API_KEY',
  'APPLE_API_KEY_ID',
  'APPLE_API_ISSUER',
] as const;
const appleIdEnvKeys = ['APPLE_ID', 'APPLE_APP_SPECIFIC_PASSWORD', 'APPLE_TEAM_ID'] as const;
// appdmg accepts an APFS filesystem setting at runtime, but the published type omits it.
const macDmgAdditionalOptions = {
  filesystem: 'APFS',
} as unknown as NonNullable<MakerDMGConfig['additionalDMGOptions']>;

function hasAnyEnv(env: NodeJS.ProcessEnv, keys: readonly string[]) {
  return keys.some((key) => Boolean(env[key]));
}

function getRequiredEnvValue(values: Record<string, string>, key: string) {
  const value = values[key];

  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }

  return value;
}

function readRequiredEnvGroup(
  env: NodeJS.ProcessEnv,
  providerName: string,
  keys: readonly string[],
): Record<string, string> | null {
  if (!hasAnyEnv(env, keys)) {
    return null;
  }

  const missingKeys = keys.filter((key) => !env[key]);

  if (missingKeys.length > 0) {
    throw new Error(
      `Missing required ${providerName} environment variables: ${missingKeys.join(', ')}`,
    );
  }

  return Object.fromEntries(keys.map((key) => [key, env[key] ?? '']));
}

export function resolveMacNotarizeConfig(
  env: NodeJS.ProcessEnv = process.env,
): PackagerConfig['osxNotarize'] {
  if (env.APPLE_KEYCHAIN_PROFILE) {
    return {
      keychainProfile: env.APPLE_KEYCHAIN_PROFILE,
      ...(env.APPLE_KEYCHAIN ? { keychain: env.APPLE_KEYCHAIN } : {}),
    };
  }

  const appStoreConnectConfig = readRequiredEnvGroup(
    env,
    'App Store Connect notarization',
    appStoreConnectEnvKeys,
  );

  if (appStoreConnectConfig) {
    return {
      appleApiKey: getRequiredEnvValue(appStoreConnectConfig, 'APPLE_API_KEY'),
      appleApiKeyId: getRequiredEnvValue(appStoreConnectConfig, 'APPLE_API_KEY_ID'),
      appleApiIssuer: getRequiredEnvValue(appStoreConnectConfig, 'APPLE_API_ISSUER'),
    };
  }

  const appleIdConfig = readRequiredEnvGroup(env, 'Apple ID notarization', appleIdEnvKeys);

  if (appleIdConfig) {
    return {
      appleId: getRequiredEnvValue(appleIdConfig, 'APPLE_ID'),
      appleIdPassword: getRequiredEnvValue(appleIdConfig, 'APPLE_APP_SPECIFIC_PASSWORD'),
      teamId: getRequiredEnvValue(appleIdConfig, 'APPLE_TEAM_ID'),
    };
  }

  return undefined;
}

export function createMacPackagerConfig(
  config: MacReleaseConfig,
  env: NodeJS.ProcessEnv = process.env,
): Pick<
  PackagerConfig,
  'appBundleId' | 'appCategoryType' | 'icon' | 'osxSign' | 'osxNotarize'
> {
  const notarizeConfig = resolveMacNotarizeConfig(env);

  return {
    appBundleId: config.appBundleId,
    appCategoryType: config.appCategoryType,
    icon: config.iconBasePath,
    osxSign: {
      ...(env.APPLE_KEYCHAIN ? { keychain: env.APPLE_KEYCHAIN } : {}),
    },
    ...(notarizeConfig ? { osxNotarize: notarizeConfig } : {}),
  };
}

export function createMacDmgMakerConfig(
  config: Pick<MacReleaseConfig, 'iconBasePath'>,
): MakerDMGConfig {
  return {
    format: 'ULFO',
    overwrite: true,
    icon: `${config.iconBasePath}.icns`,
    additionalDMGOptions: macDmgAdditionalOptions,
  };
}
