// macOS Forge packaging tests.

import { describe, expect, it } from 'vitest';

import {
  createMacDmgMakerConfig,
  createMacPackagerConfig,
  resolveMacNotarizeConfig,
} from './macos-forge';

const macReleaseConfig = {
  appBundleId: 'com.dorianzheng.dune',
  appCategoryType: 'public.app-category.developer-tools',
  iconBasePath: '/tmp/assets/icons/dune',
};

describe('resolveMacNotarizeConfig', () => {
  it('uses the keychain profile flow first', () => {
    expect(
      resolveMacNotarizeConfig({
        APPLE_KEYCHAIN: '/tmp/login.keychain-db',
        APPLE_KEYCHAIN_PROFILE: 'dune-notary',
      }),
    ).toEqual({
      keychain: '/tmp/login.keychain-db',
      keychainProfile: 'dune-notary',
    });
  });

  it('uses the App Store Connect flow when all API credentials are present', () => {
    expect(
      resolveMacNotarizeConfig({
        APPLE_API_KEY: '/tmp/AuthKey_12345.p8',
        APPLE_API_KEY_ID: 'ABCDE12345',
        APPLE_API_ISSUER: '12345678-1234-1234-1234-123456789012',
      }),
    ).toEqual({
      appleApiIssuer: '12345678-1234-1234-1234-123456789012',
      appleApiKey: '/tmp/AuthKey_12345.p8',
      appleApiKeyId: 'ABCDE12345',
    });
  });

  it('uses the Apple ID flow when all password credentials are present', () => {
    expect(
      resolveMacNotarizeConfig({
        APPLE_APP_SPECIFIC_PASSWORD: 'abcd-efgh-ijkl-mnop',
        APPLE_ID: 'user@example.com',
        APPLE_TEAM_ID: 'TEAMID1234',
      }),
    ).toEqual({
      appleId: 'user@example.com',
      appleIdPassword: 'abcd-efgh-ijkl-mnop',
      teamId: 'TEAMID1234',
    });
  });

  it('throws for partial App Store Connect credentials', () => {
    expect(() =>
      resolveMacNotarizeConfig({
        APPLE_API_KEY: '/tmp/AuthKey_12345.p8',
        APPLE_API_KEY_ID: 'ABCDE12345',
      }),
    ).toThrow('Missing required App Store Connect notarization environment variables');
  });

  it('throws for partial Apple ID credentials', () => {
    expect(() =>
      resolveMacNotarizeConfig({
        APPLE_ID: 'user@example.com',
        APPLE_TEAM_ID: 'TEAMID1234',
      }),
    ).toThrow('Missing required Apple ID notarization environment variables');
  });

  it('returns undefined when no notarization credentials are present', () => {
    expect(resolveMacNotarizeConfig({})).toBeUndefined();
  });
});

describe('createMacPackagerConfig', () => {
  it('always enables osxSign and carries stable metadata', () => {
    expect(createMacPackagerConfig(macReleaseConfig, {})).toEqual({
      appBundleId: 'com.dorianzheng.dune',
      appCategoryType: 'public.app-category.developer-tools',
      icon: '/tmp/assets/icons/dune',
      osxSign: {},
    });
  });

  it('passes APPLE_KEYCHAIN through to osxSign lookup', () => {
    expect(
      createMacPackagerConfig(macReleaseConfig, {
        APPLE_KEYCHAIN: '/tmp/login.keychain-db',
      }),
    ).toEqual({
      appBundleId: 'com.dorianzheng.dune',
      appCategoryType: 'public.app-category.developer-tools',
      icon: '/tmp/assets/icons/dune',
      osxSign: {
        keychain: '/tmp/login.keychain-db',
      },
    });
  });
});

describe('createMacDmgMakerConfig', () => {
  it('keeps the APFS workaround inside the helper', () => {
    expect(createMacDmgMakerConfig(macReleaseConfig)).toEqual({
      additionalDMGOptions: {
        filesystem: 'APFS',
      },
      format: 'ULFO',
      icon: '/tmp/assets/icons/dune.icns',
      overwrite: true,
    });
  });
});
