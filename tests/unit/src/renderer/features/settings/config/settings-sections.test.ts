// Settings sections tests.

import { describe, expect, it } from 'vitest';

import type { SettingsRoute } from '@/renderer/features/settings/types';

import { settingsSectionRegistry, settingsSections } from '@/renderer/features/settings/config/settings-sections';

const allRoutes: SettingsRoute[] = [
  'appearance',
  'artifacts',
  'budget',
  'models',
  'network',
  'shortcuts',
  'nuclear',
];

describe('settingsSectionRegistry', () => {
  it('has an entry for every SettingsRoute', () => {
    for (const route of allRoutes) {
      expect(settingsSectionRegistry[route]).toBeDefined();
    }
  });

  it('renders network below models in the section order', () => {
    expect(settingsSections.map((section) => section.id)).toEqual([
      'appearance',
      'models',
      'network',
      'artifacts',
      'shortcuts',
      'budget',
      'nuclear',
    ]);
  });
});
