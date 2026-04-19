// Settings sections tests.

import { describe, expect, it } from 'vitest';

import type { SettingsRoute } from '@/renderer/features/settings/types';

import { settingsSectionRegistry, settingsSections } from './settings-sections';

const allRoutes = settingsSections.map((section) => section.id) as SettingsRoute[];

describe('settingsSectionRegistry', () => {
  it('has an entry for every SettingsRoute', () => {
    for (const route of allRoutes) {
      expect(settingsSectionRegistry[route]).toBeDefined();
    }
  });

  it('keeps notifications near network and preserves the full section order', () => {
    expect(settingsSections.map((section) => section.id)).toEqual([
      'appearance',
      'models',
      'network',
      'notifications',
      'artifacts',
      'shortcuts',
      'nuclear',
    ]);
  });
});
