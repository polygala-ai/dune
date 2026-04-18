// Agent definition helpers (archetype + responsibilities).

import type { AgentArchetype, AgentDefinition } from '@/renderer/features/agents/types';

/** Builds a default definition for a freshly created agent. */
export function createDefaultAgentDefinition(
  archetype: AgentArchetype = 'custom',
): AgentDefinition {
  return { archetype, responsibilities: [] };
}

/** Clones a definition, guarding against undefined/nullish input. */
export function cloneAgentDefinition(
  source: AgentDefinition | null | undefined,
): AgentDefinition {
  if (!source) {
    return createDefaultAgentDefinition();
  }

  return {
    archetype: source.archetype === 'project-main' ? 'project-main' : 'custom',
    responsibilities: Array.isArray(source.responsibilities)
      ? [...source.responsibilities]
      : [],
  };
}

/** Normalizes arbitrary persisted input into a valid AgentDefinition. */
export function normalizeAgentDefinition(
  raw: unknown,
  fallbackArchetype: AgentArchetype = 'custom',
): AgentDefinition {
  if (!raw || typeof raw !== 'object') {
    return createDefaultAgentDefinition(fallbackArchetype);
  }

  const source = raw as Partial<AgentDefinition>;
  const archetype: AgentArchetype =
    source.archetype === 'project-main' || source.archetype === 'custom'
      ? source.archetype
      : fallbackArchetype;
  const responsibilities = Array.isArray(source.responsibilities)
    ? source.responsibilities.filter((entry): entry is string => typeof entry === 'string')
    : [];

  return { archetype, responsibilities };
}
