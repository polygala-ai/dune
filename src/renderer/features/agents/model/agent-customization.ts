// Agent customization helpers.

import { createId } from '@/shared/id';

/** Agent skill origin shape. */
export type AgentSkillOrigin = 'catalog' | 'global' | 'manual' | 'project';

/** Agent skill draft shape. */
export interface AgentSkillDraft {
  id: string;
  isDiscovered: boolean;
  name: string;
  origin: AgentSkillOrigin;
  path: string;
}

/** Agent MCP env var draft shape. */
export interface AgentMcpEnvVarDraft {
  id: string;
  key: string;
  value: string;
}

/** Agent MCP server draft shape. */
export interface AgentMcpServerDraft {
  args: string;
  command: string;
  enabled: boolean;
  env: AgentMcpEnvVarDraft[];
  id: string;
  name: string;
  source: string;
}

/** Agent customization draft shape. */
export interface AgentCustomizationDraft {
  additionalInstructions: string;
  mcpServers: AgentMcpServerDraft[];
  skills: AgentSkillDraft[];
}

/** Creates agent skill draft. */
export function createAgentSkillDraft(): AgentSkillDraft {
  return {
    id: createId('agent-skill'),
    isDiscovered: false,
    name: '',
    origin: 'manual',
    path: '',
  };
}

/** Creates agent MCP env var draft. */
export function createAgentMcpEnvVarDraft(): AgentMcpEnvVarDraft {
  return {
    id: createId('agent-mcp-env'),
    key: '',
    value: '',
  };
}

/** Creates agent MCP server draft. */
export function createAgentMcpServerDraft(): AgentMcpServerDraft {
  return {
    args: '',
    command: '',
    enabled: true,
    env: [],
    id: createId('agent-mcp'),
    name: '',
    source: '',
  };
}

/** Creates empty agent customization draft. */
export function createEmptyAgentCustomizationDraft(): AgentCustomizationDraft {
  return {
    additionalInstructions: '',
    mcpServers: [],
    skills: [],
  };
}

/** Clones agent customization draft. */
export function cloneAgentCustomizationDraft(
  draft: AgentCustomizationDraft | null | undefined,
): AgentCustomizationDraft {
  const source = draft ?? createEmptyAgentCustomizationDraft();

  return {
    additionalInstructions: source.additionalInstructions,
    mcpServers: source.mcpServers.map((server) => ({
      ...server,
      env: server.env.map((entry) => ({ ...entry })),
    })),
    skills: source.skills.map((skill) => ({ ...skill })),
  };
}

/** Returns whether the skill is a configured skill. */
function isConfiguredSkill(skill: AgentSkillDraft) {
  return Boolean(skill.name.trim() || skill.path.trim());
}

/** Returns whether the entry is a configured env var. */
function isConfiguredEnvVar(entry: AgentMcpEnvVarDraft) {
  return Boolean(entry.key.trim() || entry.value.trim());
}

/** Returns whether the server is a configured MCP server. */
export function isConfiguredMcpServer(server: AgentMcpServerDraft) {
  return Boolean(
    server.name.trim()
    || server.source.trim()
    || server.command.trim()
    || server.args.trim()
    || server.env.some(isConfiguredEnvVar),
  );
}

/** Counts configured skills. */
export function countConfiguredSkills(skills: AgentSkillDraft[]) {
  return skills.filter(isConfiguredSkill).length;
}

/** Counts configured MCP servers. */
export function countConfiguredMcpServers(servers: AgentMcpServerDraft[]) {
  return servers.filter(isConfiguredMcpServer).length;
}

/** Returns whether agent customization exist. */
export function hasAgentCustomization(
  draft: AgentCustomizationDraft | null | undefined,
) {
  if (!draft) {
    return false;
  }

  return Boolean(
    draft.additionalInstructions.trim()
    || countConfiguredSkills(draft.skills) > 0
    || countConfiguredMcpServers(draft.mcpServers) > 0
  );
}

/** Pluralizes. */
function pluralize(count: number, singular: string, plural: string) {
  return `${count} ${count === 1 ? singular : plural}`;
}

/** Returns agent customization summary. */
export function getAgentCustomizationSummary(
  draft: AgentCustomizationDraft | null | undefined,
) {
  if (!hasAgentCustomization(draft)) {
    return 'No customizations';
  }

  const source = draft!;
  const skillCount = countConfiguredSkills(source.skills);
  const mcpCount = countConfiguredMcpServers(source.mcpServers);
  const parts: string[] = [];

  if (source.additionalInstructions.trim()) {
    parts.push('Instructions');
  }

  if (skillCount > 0) {
    parts.push(pluralize(skillCount, 'skill', 'skills'));
  }

  if (mcpCount > 0) {
    parts.push(pluralize(mcpCount, 'MCP', 'MCPs'));
  }

  return parts.join(' · ');
}

/** Returns agent skill draft label. */
export function getAgentSkillDraftLabel(skill: AgentSkillDraft) {
  const explicitName = skill.name.trim();

  if (explicitName) {
    return explicitName;
  }

  const segments = skill.path
    .split(/[\\/]/)
    .map((segment) => segment.trim())
    .filter(Boolean);

  return segments.at(-1) ?? 'Unnamed skill';
}

/** Returns duplicate MCP server IDs. */
export function getDuplicateMcpServerIds(servers: AgentMcpServerDraft[]) {
  const duplicateIds = new Set<string>();
  const names = new Map<string, string>();

  for (const server of servers) {
    const normalizedName = server.name.trim().toLocaleLowerCase();

    if (!normalizedName) {
      continue;
    }

    const existingId = names.get(normalizedName);

    if (existingId) {
      duplicateIds.add(existingId);
      duplicateIds.add(server.id);
      continue;
    }

    names.set(normalizedName, server.id);
  }

  return duplicateIds;
}
