// Coding engine settings tests.

import { describe, expect, it, vi } from 'vitest';

import {
  CODING_ENGINE_SETTINGS_KEY,
  DEFAULT_CODING_ENGINE_SETTINGS,
  loadCodingEngineSettings,
  normalizeCodingEngineSettings,
  resolveCodingEngineSelection,
  saveCodingEngineSettings,
} from './coding-engine';

describe('coding engine settings', () => {
  it('normalizes invalid values to defaults', () => {
    expect(normalizeCodingEngineSettings('invalid')).toEqual(
      DEFAULT_CODING_ENGINE_SETTINGS,
    );
    expect(normalizeCodingEngineSettings({
      enabled: 'yes',
      selectedEngine: 'unknown',
    })).toEqual(DEFAULT_CODING_ENGINE_SETTINGS);
  });

  it('falls back to the first available engine when enabled without a selection', () => {
    expect(resolveCodingEngineSelection(
      { enabled: true, selectedEngine: null },
      ['codex', 'claude-code'],
    )).toBe('codex');
  });

  it('persists a disabled state without discarding the selected engine', async () => {
    const set = vi.fn(async () => undefined);

    const persisted = await saveCodingEngineSettings(
      {
        get: async () => null,
        set,
      },
      {
        enabled: false,
        selectedEngine: 'codex',
      },
    );

    expect(persisted).toEqual({
      enabled: false,
      selectedEngine: 'codex',
    });
    expect(set).toHaveBeenCalledWith(CODING_ENGINE_SETTINGS_KEY, persisted);
  });

  it('loads persisted settings from the settings store', async () => {
    await expect(loadCodingEngineSettings({
      get: async <T,>(key: string) => (key === CODING_ENGINE_SETTINGS_KEY
        ? {
            enabled: true,
            selectedEngine: 'codex',
          }
        : null) as T | null,
      set: async () => undefined,
    })).resolves.toEqual({
      enabled: true,
      selectedEngine: 'codex',
    });
  });
});
