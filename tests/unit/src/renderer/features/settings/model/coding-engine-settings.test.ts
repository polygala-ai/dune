// Coding engine settings model tests.

import { describe, expect, it } from 'vitest';

import {
  createDefaultCodingEngineSettings,
  getAgentLiteBackendType,
  getEnabledCodingEngineIds,
  normalizeCodingEngineSettings,
} from '@/renderer/features/settings/model/coding-engine-settings';

describe('coding-engine-settings', () => {
  it('defaults to Claude Code backend with all peers enabled', () => {
    expect(createDefaultCodingEngineSettings()).toEqual({
      backendModel: '',
      backendType: 'claudeCode',
      enabledEngineIds: ['claude-code', 'codex'],
    });
  });

  it('normalizes legacy settings that only stored enabled engine IDs', () => {
    const settings = normalizeCodingEngineSettings({
      enabledEngineIds: ['codex'],
    });

    expect(getAgentLiteBackendType(settings)).toBe('claudeCode');
    expect(getEnabledCodingEngineIds(settings)).toEqual(['codex']);
  });

  it('keeps a valid Codex backend setting', () => {
    expect(normalizeCodingEngineSettings({
      backendModel: ' gpt-5.4 ',
      backendType: 'codex',
      enabledEngineIds: ['claude-code'],
    })).toEqual({
      backendModel: 'gpt-5.4',
      backendType: 'codex',
      enabledEngineIds: ['claude-code'],
    });
  });
});
