// External module configuration tests.

import { describe, expect, it } from 'vitest';

import { externalModules, isExternalModuleId } from './external-modules';

describe('isExternalModuleId', () => {
  it('matches exact package ids from the external module list', () => {
    for (const moduleId of externalModules) {
      expect(isExternalModuleId(moduleId)).toBe(true);
    }
  });

  it('matches subpath imports for configured external packages', () => {
    expect(isExternalModuleId('@boxlite-ai/agentlite/channels/telegram')).toBe(true);
    expect(isExternalModuleId('better-sqlite3/lib/database')).toBe(true);
  });

  it('matches resolved node_modules paths for configured external packages', () => {
    expect(
      isExternalModuleId(
        '/Users/test/project/node_modules/@boxlite-ai/agentlite/dist/sdk.js',
      ),
    ).toBe(true);
    expect(
      isExternalModuleId(
        '/Users/test/project/node_modules/.pnpm/better-sqlite3@12.8.0/node_modules/better-sqlite3/lib/database.js',
      ),
    ).toBe(true);
  });

  it('does not match similarly prefixed package names', () => {
    expect(isExternalModuleId('@boxlite-ai/agentlite-extra')).toBe(false);
    expect(isExternalModuleId('better-sqlite30')).toBe(false);
    expect(
      isExternalModuleId(
        '/Users/test/project/node_modules/@boxlite-ai/agentlite-extra/dist/index.js',
      ),
    ).toBe(false);
  });
});
