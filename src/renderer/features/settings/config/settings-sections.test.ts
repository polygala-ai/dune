// Settings sections tests.

import { describe, expect, it } from 'vitest';

import type { SettingsRoute } from '@/renderer/features/settings/types';

import { settingsSectionRegistry, settingsSections } from './settings-sections';

const allRoutes: SettingsRoute[] = [
  'appearance',
  'artifacts',
  'models',
  'network',
  'templates',
  'shortcuts',
  'nuclear',
];

describe('settingsSectionRegistry', () => {
  it('has an entry for every SettingsRoute', () => {
    for (const route of allRoutes) {
      expect(settingsSectionRegistry[route]).toBeDefined();
    }
  });

  it('renders templates below artifacts in the section order', () => {
    expect(settingsSections.map((section) => section.id)).toEqual([
      'appearance',
      'models',
      'network',
      'artifacts',
      'templates',
      'shortcuts',
      'nuclear',
    ]);
  });
});
