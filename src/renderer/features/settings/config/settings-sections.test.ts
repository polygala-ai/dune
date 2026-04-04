import { describe, expect, it } from 'vitest';

import type { SettingsRoute } from '@/renderer/features/settings/types';

import { settingsSectionRegistry } from './settings-sections';

const allRoutes: SettingsRoute[] = ['appearance', 'channels', 'network', 'models', 'shortcuts'];

describe('settingsSectionRegistry', () => {
  it('has an entry for every SettingsRoute', () => {
    for (const route of allRoutes) {
      expect(settingsSectionRegistry[route]).toBeDefined();
    }
  });
});
