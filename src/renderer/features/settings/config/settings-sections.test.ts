// Settings sections tests.

import { describe, expect, it } from 'vitest';

import { settingsSectionRegistry, settingsSections } from './settings-sections';

describe('settingsSectionRegistry', () => {
  it('has an entry for every SettingsRoute', () => {
    expect(Object.keys(settingsSectionRegistry).sort()).toEqual([
      'appearance',
      'artifacts',
      'models',
      'network',
      'notifications',
      'nuclear',
      'shortcuts',
    ]);
  });

  it('renders notifications below artifacts in the section order', () => {
    expect(settingsSections.map((section) => section.id)).toEqual([
      'appearance',
      'models',
      'network',
      'artifacts',
      'notifications',
      'shortcuts',
      'nuclear',
    ]);
  });
});
