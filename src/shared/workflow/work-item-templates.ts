// Work item template helpers.

import { isPlainObject } from '@/shared/is-record';
import { normalizeWorkflowTaskTitles } from '@/shared/workflow/default-tasks';

/** Work item template shape. */
export interface WorkItemTemplate {
  briefTemplate: string;
  builtIn: boolean;
  createdAt: number;
  /** Agent ID or exact agent name to assign when the template is used. */
  defaultAgentId: string | null;
  defaultTasks: string[];
  id: string;
  name: string;
  titlePattern: string;
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
    briefTemplate: 'Research {topic} and summarize findings.',
    builtIn: true,
    createdAt: 0,
    defaultAgentId: null,
    defaultTasks: ['Define scope', 'Gather sources', 'Summarize findings', 'Write report'],
    id: 'builtin-research-task',
    name: 'Research task',
    titlePattern: 'Research: {topic}',
    updatedAt: 0,
  },
  {
    briefTemplate: 'Investigate and fix {bug}.',
    builtIn: true,
    createdAt: 0,
    defaultAgentId: null,
    defaultTasks: ['Reproduce bug', 'Identify root cause', 'Implement fix', 'Write test', 'Open PR'],
    id: 'builtin-bug-fix',
    name: 'Bug fix',
    titlePattern: 'Fix: {bug}',
    updatedAt: 0,
  },
  {
    briefTemplate: 'Design and implement {feature}.',
    builtIn: true,
    createdAt: 0,
    defaultAgentId: null,
    defaultTasks: ['Write design doc', 'Implement feature', 'Write tests', 'Open PR'],
    id: 'builtin-feature-implementation',
    name: 'Feature implementation',
    titlePattern: 'Implement: {feature}',
    updatedAt: 0,
  },
  {
    briefTemplate: 'Review PR {PR} for correctness, style, and performance.',
    builtIn: true,
    createdAt: 0,
    defaultAgentId: null,
    defaultTasks: ['Read diff', 'Run tests locally', 'Leave review comments'],
    id: 'builtin-code-review',
    name: 'Code review',
    titlePattern: 'Review: {PR}',
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
  const name = typeof value.name === 'string' ? value.name.trim() : '';

  if (!id || !name) {
    return null;
  }

  const template: WorkItemTemplate = {
    briefTemplate: typeof value.briefTemplate === 'string'
      ? value.briefTemplate
      : typeof value.brief === 'string'
        ? value.brief
        : '',
    createdAt: normalizeTimestamp(value.createdAt),
    defaultAgentId: null,
    defaultTasks: Array.isArray(value.defaultTasks)
      ? normalizeWorkflowTaskTitles(
          value.defaultTasks.filter((task): task is string => typeof task === 'string'),
        )
      : [],
    id,
    builtIn: value.builtIn === true || value.isBuiltIn === true || isBuiltInWorkItemTemplateId(id),
    name,
    titlePattern: typeof value.titlePattern === 'string' ? value.titlePattern : '',
    updatedAt: normalizeTimestamp(value.updatedAt),
  };
  const defaultAgentId = normalizeOptionalAgentId(
    value.defaultAgentId ?? value.defaultAssignedAgentId,
  );

  template.defaultAgentId = defaultAgentId ?? null;

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
    brief: template.briefTemplate,
    taskTitles: [...template.defaultTasks],
    title: template.titlePattern,
  };
}

/** Resolves the template default agent for the target project. */
export function resolveWorkItemTemplateDefaultAgent(
  template: WorkItemTemplate | null | undefined,
  projectId: string,
  agents: TemplateScopedAgent[],
) {
  const defaultAgentId = normalizeOptionalAgentId(template?.defaultAgentId);

  if (!defaultAgentId) {
    return null;
  }

  const matchingAgent = agents.find((agent) =>
    agent.id === defaultAgentId || agent.name === defaultAgentId,
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
