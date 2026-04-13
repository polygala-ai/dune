import { createId } from '@/shared/id';

export type AgentSkillOrigin = 'catalog' | 'global' | 'manual' | 'project';

export interface AgentSkillDraft {
  id: string;
  isDiscovered: boolean;
  name: string;
  origin: AgentSkillOrigin;
  path: string;
}

export interface AgentMcpEnvVarDraft {
  id: string;
  key: string;
  value: string;
}

export interface AgentMcpServerDraft {
  args: string;
  command: string;
  enabled: boolean;
  env: AgentMcpEnvVarDraft[];
  id: string;
  name: string;
  source: string;
}

export interface AgentCustomizationDraft {
  additionalInstructions: string;
  mcpServers: AgentMcpServerDraft[];
  skills: AgentSkillDraft[];
}

export function createAgentSkillDraft(): AgentSkillDraft {
  return {
    id: createId('agent-skill'),
    isDiscovered: false,
    name: '',
    origin: 'manual',
    path: '',
  };
}

export function createAgentMcpEnvVarDraft(): AgentMcpEnvVarDraft {
  return {
    id: createId('agent-mcp-env'),
    key: '',
    value: '',
  };
}

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

export function createEmptyAgentCustomizationDraft(): AgentCustomizationDraft {
  return {
    additionalInstructions: '',
    mcpServers: [],
    skills: [],
  };
}

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

function isConfiguredSkill(skill: AgentSkillDraft) {
  return Boolean(skill.name.trim() || skill.path.trim());
}

function isConfiguredEnvVar(entry: AgentMcpEnvVarDraft) {
  return Boolean(entry.key.trim() || entry.value.trim());
}

export function isConfiguredMcpServer(server: AgentMcpServerDraft) {
  return Boolean(
    server.name.trim()
    || server.source.trim()
    || server.command.trim()
    || server.args.trim()
    || server.env.some(isConfiguredEnvVar),
  );
}

export function countConfiguredSkills(skills: AgentSkillDraft[]) {
  return skills.filter(isConfiguredSkill).length;
}

export function countConfiguredMcpServers(servers: AgentMcpServerDraft[]) {
  return servers.filter(isConfiguredMcpServer).length;
}

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

function pluralize(count: number, singular: string, plural: string) {
  return `${count} ${count === 1 ? singular : plural}`;
}

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
