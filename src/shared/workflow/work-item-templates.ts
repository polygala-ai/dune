// Work item template helpers.

import { isPlainObject } from '@/shared/is-record';
import { normalizeWorkflowTaskTitles } from '@/shared/workflow/default-tasks';

/** Work item template shape. */
export interface WorkItemTemplate {
  brief: string;
  builtIn: boolean;
  createdAt: number;
  /** Agent ID or exact agent name to assign when the template is used. */
  agentId: string | null;
  id: string;
  name: string;
  tasks: string[];
  title: string;
  updatedAt: number;
}

/** Template-scoped agent shape. */
export interface TemplateScopedAgent {
  id: string;
  name: string;
  projectId: string | null;
}

/** Prefilled work item draft shape. */
export interface WorkItemTemplatePrefill {
  brief: string;
  taskTitles: string[];
  title: string;
}

/** Built-in work item templates. */
export const BUILTIN_WORK_ITEM_TEMPLATES: WorkItemTemplate[] = [
  {
    brief: 'Research {topic} and summarize findings. Identify credible sources, compare tradeoffs, and end with a concise recommendation.',
    builtIn: true,
    createdAt: 0,
    agentId: null,
    id: 'builtin-research-task',
    name: 'Research task',
    tasks: ['Define scope', 'Gather sources', 'Summarize findings', 'Write report'],
    title: 'Research: {topic}',
    updatedAt: 0,
  },
  {
    brief: 'Investigate the reported bug, document reproduction steps, identify the root cause, implement the fix, and add regression coverage.',
    builtIn: true,
    createdAt: 0,
    agentId: null,
    id: 'builtin-bug-fix',
    name: 'Bug fix',
    tasks: ['Reproduce bug', 'Identify root cause', 'Implement fix', 'Write test', 'Open PR'],
    title: 'Fix: {bug}',
    updatedAt: 0,
  },
  {
    brief: 'Implement the requested feature end to end. Match existing product patterns, update relevant tests, and call out any follow-up work.',
    builtIn: true,
    createdAt: 0,
    agentId: null,
    id: 'builtin-feature-implementation',
    name: 'Feature implementation',
    tasks: ['Write design doc', 'Implement feature', 'Write tests', 'Open PR'],
    title: 'Implement: {feature}',
    updatedAt: 0,
  },
  {
    brief: 'Review the target change for correctness, regressions, maintainability, and missing tests. Prioritize actionable findings with file and line references.',
    builtIn: true,
    createdAt: 0,
    agentId: null,
    id: 'builtin-code-review',
    name: 'Code review',
    tasks: ['Read diff', 'Run tests locally', 'Leave review comments'],
    title: 'Review: {PR}',
    updatedAt: 0,
  },
];

export const BUILTIN_WORK_ITEM_TEMPLATE_IDS = new Set(
  BUILTIN_WORK_ITEM_TEMPLATES.map((template) => template.id),
);

function normalizeOptionalAgentId(value: unknown) {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim();
  return normalized || undefined;
}

function normalizeTimestamp(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : 0;
}

/** Returns whether the template ID belongs to a built-in template. */
export function isBuiltInWorkItemTemplateId(templateId: string) {
  return BUILTIN_WORK_ITEM_TEMPLATE_IDS.has(templateId);
}

/** Normalizes a single work item template. */
export function normalizeWorkItemTemplate(value: unknown): WorkItemTemplate | null {
  if (!isPlainObject(value)) {
    return null;
  }

  const id = typeof value.id === 'string' ? value.id.trim() : '';
  const title = typeof value.title === 'string'
    ? value.title
    : typeof value.titlePattern === 'string'
      ? value.titlePattern
      : '';
  const name = typeof value.name === 'string' && value.name.trim()
    ? value.name.trim()
    : title.trim() || id;

  if (!id) {
    return null;
  }

  const template: WorkItemTemplate = {
    brief: typeof value.brief === 'string'
        ? value.brief
        : typeof value.briefTemplate === 'string'
          ? value.briefTemplate
        : '',
    createdAt: normalizeTimestamp(value.createdAt),
    agentId: null,
    tasks: Array.isArray(value.tasks)
      ? normalizeWorkflowTaskTitles(
          value.tasks.filter((task): task is string => typeof task === 'string'),
        )
      : Array.isArray(value.defaultTasks)
        ? normalizeWorkflowTaskTitles(
            value.defaultTasks.filter((task): task is string => typeof task === 'string'),
          )
      : [],
    id,
    builtIn: value.builtIn === true || value.isBuiltIn === true || isBuiltInWorkItemTemplateId(id),
    name,
    title,
    updatedAt: normalizeTimestamp(value.updatedAt),
  };
  const agentId = normalizeOptionalAgentId(
    value.agentId ?? value.assignedAgentId ?? value.defaultAgentId ?? value.defaultAssignedAgentId,
  );

  template.agentId = agentId ?? null;

  return template;
}

/** Normalizes work item templates. */
export function normalizeWorkItemTemplates(value: unknown): WorkItemTemplate[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const seenIds = new Set<string>();
  const normalizedTemplates: WorkItemTemplate[] = [];

  for (const candidate of value) {
    const normalizedTemplate = normalizeWorkItemTemplate(candidate);

    if (!normalizedTemplate || seenIds.has(normalizedTemplate.id)) {
      continue;
    }

    seenIds.add(normalizedTemplate.id);
    normalizedTemplates.push(normalizedTemplate);
  }

  return normalizedTemplates;
}

/** Creates a prefilled work item draft from a template. */
export function createWorkItemTemplatePrefill(template: WorkItemTemplate): WorkItemTemplatePrefill {
  return {
    brief: template.brief,
    taskTitles: [...template.tasks],
    title: template.title,
  };
}

/** Resolves the template default agent for the target project. */
export function resolveWorkItemTemplateDefaultAgent(
  template: WorkItemTemplate | null | undefined,
  projectId: string,
  agents: TemplateScopedAgent[],
) {
  const agentId = normalizeOptionalAgentId(template?.agentId);

  if (!agentId) {
    return null;
  }

  const matchingAgent = agents.find((agent) =>
    agent.id === agentId || agent.name === agentId,
  );

  if (!matchingAgent) {
    return null;
  }

  if (matchingAgent.projectId && matchingAgent.projectId !== projectId) {
    return null;
  }

  return {
    id: matchingAgent.id,
    name: matchingAgent.name,
  };
}
